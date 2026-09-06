import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T005 — FR-013 / SC-008: the compose stack provisions the bucket **and** a `quarantine/`
 * prefix, and that prefix is not publicly served.
 *
 * Why the prefix matters: with `clientUploads` the browser PUTs straight to the bucket
 * (spike S1), so an object exists before anything has looked at its bytes. The plan's answer
 * (§ Sketch 4, and the risk table row "Presigned upload bypasses verification") is that
 * unverified objects land in `quarantine/`, which no anonymous reader can fetch; only a
 * passing signature check moves them out. If that prefix is publicly served, the quarantine
 * is decoration and a hostile upload is reachable by URL the moment it lands.
 *
 * The script is **driven**, not grepped: a grep proves a string is present, not that running
 * the stack produces a private quarantine prefix. `FakeMc` stands in for the `mc` binary —
 * it records every invocation and answers `anonymous get` from a scripted permission, so the
 * refusal path can be watched red without a MinIO server (CI provisions none).
 *
 * FakeMc's `anonymous get --json` output shape is **measured, not invented**: it was captured
 * from `minio/mc:latest` against the running compose stack on 2026-09-06 —
 *   {"operation":"get","status":"success","bucket":"local/fablab","permission":"private"}
 *
 * The script also runs with a PATH holding **only** what `minio/mc:latest` ships, because the
 * image ships no `sed`, no `awk` and no `grep` — measured after the first implementation died
 * there with `sed: command not found`, exit 127. A fake `mc` on the developer's fat PATH calls
 * that green; this does not.
 *
 * The same measurement is why the script *verifies* rather than merely setting a policy:
 * `mc anonymous set none <bucket>/<prefix>` does **not** remove a bucket-root grant — with
 * `download` set on `local/fablab`, `set none` on the prefix reported it still `download`.
 * `anonymous get` on a prefix, by contrast, reports the *effective* permission, so it is the
 * only one of the two that can notice the leak.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const INIT_SCRIPT = join(REPO_ROOT, 'infra', 'minio-init.sh')
const COMPOSE_FILE = join(REPO_ROOT, 'infra', 'docker-compose.yml')

const BUCKET = 'fablab'
const QUARANTINE = 'quarantine'

/**
 * Records every `mc` invocation to `$MC_LOG` and answers `anonymous get` with the permission
 * the test scripted, defaulting to the private bucket a fresh MinIO gives you.
 */
const FAKE_MC = `#!/bin/sh
printf '%s\\n' "$*" >> "$MC_LOG"
if [ "$1" = "anonymous" ] && [ "$2" = "get" ]; then
  shift 2
  target=""
  for arg in "$@"; do
    case "$arg" in -*) ;; *) target="$arg" ;; esac
  done
  permission="\${MC_BUCKET_PERMISSION:-private}"
  case "$target" in *${QUARANTINE}*) permission="\${MC_QUARANTINE_PERMISSION:-private}" ;; esac
  printf '{"operation":"get","status":"success","bucket":"%s","permission":"%s"}\\n' \\
    "$target" "$permission"
fi
exit 0
`

/**
 * Every external binary `minio/mc:latest` actually provides, measured with `command -v`
 * inside the image on 2026-09-06. `sed`, `awk`, `grep`, `jq` and `busybox` are all absent —
 * the script may not reach for them, and this list is what enforces that.
 */
const IMAGE_TOOLS = ['cut', 'tr', 'expr', 'head', 'cat', 'ls', 'rm', 'mkdir', 'env']

type InitRun = { status: number | null; stdout: string; stderr: string; commands: string[] }

/** Runs infra/minio-init.sh with FakeMc as its `mc` and nothing else the image lacks. */
function runInitScript(env: Record<string, string> = {}, runs = 1): InitRun {
  const dir = mkdtempSync(join(tmpdir(), 'fablab-minio-init-'))
  const fake = join(dir, 'mc')
  writeFileSync(fake, FAKE_MC)
  chmodSync(fake, 0o755)
  for (const tool of IMAGE_TOOLS) {
    const resolved = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' })
    if (resolved.status === 0) symlinkSync(resolved.stdout.trim(), join(dir, tool))
  }
  const log = join(dir, 'mc.log')
  writeFileSync(log, '')

  let result = { status: null as number | null, stdout: '', stderr: '' }
  for (let run = 0; run < runs; run += 1) {
    // /bin/sh by absolute path: PATH holds only the image's own tools, so `sh` itself would
    // not resolve through it.
    result = spawnSync('/bin/sh', [INIT_SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: dir,
        MC_LOG: log,
        MINIO_ROOT_USER: BUCKET,
        MINIO_ROOT_PASSWORD: 'fablab-dev-secret',
        S3_BUCKET: BUCKET,
        ...env,
      },
    })
  }

  const commands = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  return { ...result, commands }
}

/** The lines of one top-level service block of the compose file. */
function composeService(name: string): string {
  const source = readFileSync(COMPOSE_FILE, 'utf8').split('\n')
  const start = source.findIndex((line) => line.startsWith(`  ${name}:`))
  expect(start, `infra/docker-compose.yml declares no '${name}' service`).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const end = rest.findIndex((line) => /^ {2}\S/.test(line))
  return rest.slice(0, end === -1 ? rest.length : end).join('\n')
}

describe('the compose stack provisions the bucket and the quarantine prefix (FR-013)', () => {
  it('creates the bucket', () => {
    const { status, commands } = runInitScript()
    expect(status, 'minio-init.sh exited non-zero against a healthy fake mc').toBe(0)
    expect(
      commands.some((command) => /(^|\s)mb\s.*\/fablab$/.test(command)),
      `minio-init.sh never created the bucket. It ran: ${commands.join(' | ')}`,
    ).toBe(true)
  })

  it('creates the quarantine/ prefix the presign path uploads into', () => {
    const { commands } = runInitScript()
    expect(
      commands.some((command) => /(^|\s)(mb|pipe|cp)\s.*\/fablab\/quarantine(\/|$)/.test(command)),
      'minio-init.sh never created the quarantine/ prefix. With clientUploads the browser ' +
        'PUTs straight to the bucket, so unverified bytes need a prefix that exists and is ' +
        `not served before the first upload. It ran: ${commands.join(' | ')}`,
    ).toBe(true)
  })

  it('declares the quarantine prefix in the compose stack, beside the bucket', () => {
    const service = composeService('storage-init')
    expect(service, 'storage-init no longer passes the bucket name').toMatch(
      /S3_BUCKET:\s*fablab/,
    )
    expect(
      service,
      'infra/docker-compose.yml does not declare QUARANTINE_PREFIX for storage-init. The ' +
        'prefix is stack configuration like the bucket is — buried in the script it becomes ' +
        'a magic string the upload code has to guess at.',
    ).toMatch(/QUARANTINE_PREFIX:\s*quarantine\b/)
  })

  it('re-runs cleanly, so a second `docker compose up` is not a broken quick start', () => {
    const { status, stderr } = runInitScript({}, 2)
    expect(status, `second run failed: ${stderr.trim()}`).toBe(0)
  })
})

describe('quarantine/ is not publicly served (SC-008)', () => {
  it('refuses to report the stack ready when quarantine is anonymously readable', () => {
    // The planted violation: mc reports the effective permission on the prefix as `download`,
    // which is what a bucket-root grant looks like from the prefix. Measured, not imagined —
    // that is exactly what the real binary returned when `download` was set on the root.
    const { status, stdout, stderr } = runInitScript({ MC_QUARANTINE_PERMISSION: 'download' })
    expect(
      status,
      'minio-init.sh exited 0 with quarantine publicly readable. An unverified upload is ' +
        `then fetchable by URL the moment it lands. Output: ${stdout}${stderr}`,
    ).not.toBe(0)
    expect(`${stdout}${stderr}`).toMatch(/quarantine/)
    expect(
      `${stdout}${stderr}`,
      'the refusal does not name the permission it found, so nobody can act on it',
    ).toMatch(/download/)
  })

  it('accepts a served prefix elsewhere in the bucket, which reads as `custom`', () => {
    // A later task grants anonymous download on the *served* prefix. From quarantine that
    // reads as `custom` (measured), and refusing it would make the stack unstartable the day
    // released objects become publicly readable.
    const { status, stderr } = runInitScript({ MC_QUARANTINE_PERMISSION: 'custom' })
    expect(status, `a policy that does not cover quarantine was refused: ${stderr}`).toBe(0)
  })

  it('never grants anonymous access on the bucket root', () => {
    const { commands } = runInitScript()
    const rootGrant = commands.find((command) =>
      /anonymous\s+set\s+(download|upload|public)\s+\S+\/fablab$/.test(command),
    )
    expect(
      rootGrant,
      'minio-init.sh grants anonymous access at the bucket root, which covers ' +
        'quarantine/ too — the prefix stops being a quarantine at all.',
    ).toBeUndefined()
  })
})
