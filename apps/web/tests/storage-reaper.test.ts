import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * T020 — FR-019: the orphan reaper. A presigned upload that is never completed leaves an
 * object under `quarantine/` that no database row points at, so nothing in the application
 * will ever look at it again. `tech-stack.md` § Storage names disk exhaustion as failure
 * number one, and the plan's risk table answers it with a **bucket lifecycle rule** owned by
 * this feature rather than left unowned (plan § Riscos, "Abandoned presigned uploads
 * accumulate").
 *
 * The script is **driven**, not grepped — a grep proves a string is present, not that running
 * the stack leaves an expiry rule on the bucket. `FakeMc` stands in for the `mc` binary: it
 * records every invocation and keeps the bucket's lifecycle document in a file, so the test
 * can assert what the stack *ends up with* after one run and after two.
 *
 * FakeMc models two behaviours that were **measured against `minio/mc:latest`** on
 * 2026-09-06, against the running compose stack, not assumed:
 *
 *   1. `mc ilm rule add --expire-days 7 --prefix quarantine/ local/b` **appends** a rule with a
 *      freshly generated ID on every invocation. Run twice it reported IDs
 *      `daep5oas7nf006brcsm0` and `daep5oas7nf008hfcnjg`, and `mc ilm rule ls --json` then
 *      listed *two* identical rules. `mc mb --ignore-existing` makes this script safe to
 *      re-run; `rule add` would quietly undo that, one duplicate rule per `docker compose up`.
 *   2. `mc ilm rule import local/b < doc.json` **replaces** the whole lifecycle document, so
 *      the second import is a no-op on the stored state. That is the idempotent verb.
 *
 * `mc ilm rule export` on a bucket with no lifecycle exits **1** (measured: "Unable to get
 * lifecycle configuration"), which under the script's `set -eu` would abort the stack — the
 * read has to be written so that a missing lifecycle reaches the verification, not the shell.
 *
 * Like T005's quarantine check, this **verifies rather than merely sets**: a reaper nobody
 * confirmed is the failure mode the requirement exists to prevent, because an absent expiry
 * rule looks exactly like a working one until the disk is full.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const INIT_SCRIPT = join(REPO_ROOT, 'infra', 'minio-init.sh')
const COMPOSE_FILE = join(REPO_ROOT, 'infra', 'docker-compose.yml')

const BUCKET = 'fablab'

/**
 * Records every `mc` invocation to `$MC_LOG`, answers `anonymous get` with the permission the
 * test scripted, and keeps the bucket lifecycle document in `$MC_ILM` — appending for `rule
 * add`, replacing for `rule import`, exactly as the real binary was measured to behave.
 * `$MC_ILM_EXPORT`, when set, overrides what a read-back returns, which is how the
 * "rule never landed" path is watched red.
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
  case "$target" in *quarantine*) permission="\${MC_QUARANTINE_PERMISSION:-private}" ;; esac
  printf '{"operation":"get","status":"success","bucket":"%s","permission":"%s"}\\n' \\
    "$target" "$permission"
  exit 0
fi

if [ "$1" = "ilm" ]; then
  verb="$2"
  if [ "$verb" = "rule" ]; then verb="$3"; fi
  case "$verb" in
    import)
      cat > "$MC_ILM"
      ;;
    add)
      days=""
      prefix=""
      while [ $# -gt 0 ]; do
        case "$1" in
          --expire-days) days="$2" ;;
          --prefix) prefix="$2" ;;
        esac
        shift
      done
      printf '{"Expiration":{"Days":%s},"Filter":{"Prefix":"%s"},"Status":"Enabled"}\\n' \\
        "$days" "$prefix" >> "$MC_ILM"
      ;;
    export | ls | list)
      if [ -n "\${MC_ILM_EXPORT:-}" ]; then
        printf '%s\\n' "$MC_ILM_EXPORT"
        exit 0
      fi
      if [ -s "$MC_ILM" ]; then
        cat "$MC_ILM"
      else
        echo "mc: <ERROR> Unable to get lifecycle configuration." >&2
        exit 1
      fi
      ;;
  esac
  exit 0
fi
exit 0
`

/**
 * Every external binary `minio/mc:latest` actually provides, measured with `command -v`
 * inside the image. `sed`, `awk`, `grep`, `jq` and `busybox` are all absent — a reaper written
 * with any of them dies at `command not found`, which docker compose reports as a failed init
 * rather than as a missing expiry rule.
 */
const IMAGE_TOOLS = ['cut', 'tr', 'expr', 'head', 'cat', 'ls', 'rm', 'mkdir', 'env']

type InitRun = {
  status: number | null
  stdout: string
  stderr: string
  commands: string[]
  /** The lifecycle document the stack is left holding, as FakeMc stored it. */
  lifecycle: string
}

/** Runs infra/minio-init.sh with FakeMc as its `mc` and nothing else the image lacks. */
function runInitScript(env: Record<string, string> = {}, runs = 1): InitRun {
  const dir = mkdtempSync(join(tmpdir(), 'fablab-minio-reaper-'))
  const fake = join(dir, 'mc')
  writeFileSync(fake, FAKE_MC)
  chmodSync(fake, 0o755)
  for (const tool of IMAGE_TOOLS) {
    const resolved = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' })
    if (resolved.status === 0) symlinkSync(resolved.stdout.trim(), join(dir, tool))
  }
  const log = join(dir, 'mc.log')
  const ilm = join(dir, 'lifecycle.json')
  writeFileSync(log, '')
  writeFileSync(ilm, '')

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
        MC_ILM: ilm,
        MINIO_ROOT_USER: BUCKET,
        MINIO_ROOT_PASSWORD: 'fablab-dev-secret',
        S3_BUCKET: BUCKET,
        ...env,
      },
    })
  }

  return {
    ...result,
    commands: readFileSync(log, 'utf8').split('\n').filter(Boolean),
    lifecycle: readFileSync(ilm, 'utf8'),
  }
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

/** How many expiry rules the stored lifecycle document holds. */
function ruleCount(lifecycle: string): number {
  return (lifecycle.match(/"Days"/g) ?? []).length
}

describe('the orphan reaper expires abandoned quarantine objects (FR-019)', () => {
  it('leaves the bucket holding an expiry rule scoped to the quarantine prefix', () => {
    const { status, lifecycle, commands } = runInitScript()
    expect(status, `minio-init.sh exited non-zero against a healthy fake mc: ${lifecycle}`).toBe(0)
    expect(
      lifecycle,
      'minio-init.sh left no lifecycle rule on the bucket. An abandoned presigned upload ' +
        'leaves an object under quarantine/ that no database row points at, so nothing will ' +
        'ever delete it — tech-stack.md § Storage names disk exhaustion as failure number ' +
        `one. It ran: ${commands.join(' | ')}`,
    ).toMatch(/"Days"\s*:\s*\d+/)
    expect(
      lifecycle,
      'the expiry rule is not scoped to quarantine/. Unscoped, it reaps released objects too ' +
        '— published project photos would vanish on a timer.',
    ).toMatch(/"Prefix"\s*:\s*"quarantine\/"/)
    expect(
      lifecycle,
      'the rule is not Enabled, so MinIO stores it and never applies it',
    ).toMatch(/"Status"\s*:\s*"Enabled"/)
  })

  it('does not accumulate a duplicate rule per `docker compose up`', () => {
    // Measured, not imagined: `mc ilm rule add` mints a fresh rule ID on every invocation, so
    // the naive implementation leaves N identical rules after N starts. `mc mb
    // --ignore-existing` already makes this script re-runnable; the reaper must not undo that.
    const { status, lifecycle, stderr } = runInitScript({}, 2)
    expect(status, `second run failed: ${stderr.trim()}`).toBe(0)
    expect(
      ruleCount(lifecycle),
      `two runs left ${ruleCount(lifecycle)} expiry rules on the bucket: ${lifecycle}`,
    ).toBe(1)
  })

  it('takes the expiry window from the environment, not from a literal in the script', () => {
    const { lifecycle } = runInitScript({ QUARANTINE_EXPIRY_DAYS: '3' })
    expect(
      lifecycle,
      'minio-init.sh ignored QUARANTINE_EXPIRY_DAYS. FR-019 puts storage configuration in the ' +
        'environment; a hardcoded window cannot be tuned when uploads outlive it.',
    ).toMatch(/"Days"\s*:\s*3\b/)
  })

  it('declares the expiry window in the compose stack, beside the bucket and the prefix', () => {
    const service = composeService('storage-init')
    expect(
      service,
      'infra/docker-compose.yml does not declare QUARANTINE_EXPIRY_DAYS for storage-init. The ' +
        'reaper window is stack configuration like S3_BUCKET and QUARANTINE_PREFIX are; left ' +
        'only inside the script it is invisible to whoever operates the stack.',
    ).toMatch(/QUARANTINE_EXPIRY_DAYS:/)
  })

  it('refuses to report the stack ready when the rule did not land', () => {
    // The planted violation: the read-back comes back describing some other prefix, which is
    // what a lifecycle document that lost the quarantine rule looks like. Setting without
    // verifying is the failure this requirement exists to prevent — an absent expiry rule is
    // indistinguishable from a working one until the disk is full.
    const { status, stdout, stderr } = runInitScript({
      MC_ILM_EXPORT: '{"Rules":[{"Expiration":{"Days":7},"Filter":{"Prefix":"outra/"},' +
        '"ID":"nao-e-a-quarentena","Status":"Enabled"}]}',
    })
    expect(
      status,
      'minio-init.sh reported the stack ready with no expiry rule on quarantine/. Abandoned ' +
        `uploads then accumulate silently until the volume fills. Output: ${stdout}${stderr}`,
    ).not.toBe(0)
    expect(
      `${stdout}${stderr}`,
      'the refusal does not name the prefix it was checking, so nobody can act on it',
    ).toMatch(/quarantine/)
  })
})
