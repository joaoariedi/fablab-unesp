import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * FR-019: object storage is S3-compatible and swapped by environment alone — MinIO in
 * development, S3/R2 in production, never a code change. That promise rests on one
 * package: `@payloadcms/storage-s3`, the adapter `payload.config.ts` registers (T003).
 *
 * It is a **runtime** dependency, not a dev one. The adapter is loaded by `next build`
 * and by every `payload` command in production, where devDependencies are not installed.
 *
 * Resolution is checked in a **child Node process, not in-process** — the lesson
 * `ui-dependency.test.ts` paid for in feature 001 round 4. Vitest patches CJS resolution
 * through Vite's resolver and exports a NODE_PATH pointing at pnpm's hidden hoist
 * directory, so an in-process `require.resolve` succeeds with the dependency undeclared
 * and asserts nothing. `next build` runs under plain Node, so plain Node must resolve it.
 *
 * Declaring the dependency is also not sufficient on its own: pnpm only creates the
 * `apps/web/node_modules/@payloadcms/storage-s3` link at install time.
 */

const APP_DIR = join(import.meta.dirname, '..')
const ADAPTER = '@payloadcms/storage-s3'

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const manifest = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as Manifest

/** `require.resolve(ADAPTER)` as a plain Node process rooted in apps/web would see it. */
function resolveFromAppInRealNode(): { status: number | null; stdout: string; stderr: string } {
  const script =
    "const {createRequire} = require('node:module');" +
    'const req = createRequire(process.argv[1]);' +
    `process.stdout.write(req.resolve(${JSON.stringify(ADAPTER)}));`
  const result = spawnSync(process.execPath, ['-e', script, join(APP_DIR, 'package.json')], {
    cwd: APP_DIR,
    encoding: 'utf8',
    // Cleared for the same reason as in ui-dependency.test.ts: inheriting Vitest's
    // NODE_PATH makes this check pass with nothing declared.
    env: { ...process.env, NODE_PATH: '' },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('apps/web depends on @payloadcms/storage-s3', () => {
  it('declares the S3 adapter as a runtime dependency', () => {
    expect(
      manifest.dependencies?.[ADAPTER],
      `apps/web/package.json does not list ${ADAPTER} in dependencies. ` +
        'FR-019 (storage swapped by env alone) has no adapter to configure without it.',
    ).toBeDefined()
    expect(
      manifest.devDependencies?.[ADAPTER],
      `${ADAPTER} is a devDependency. Production installs omit those, and the adapter is ` +
        'loaded by next build and every payload command.',
    ).toBeUndefined()
  })

  it('pins the adapter to the same version as the payload core', () => {
    // The adapter is versioned in lockstep with payload itself; a drifted pair is the
    // failure mode that surfaces as a runtime plugin-shape error, not an install error.
    const core = manifest.dependencies?.['payload']
    expect(
      manifest.dependencies?.[ADAPTER],
      `${ADAPTER} must be pinned to ${core}, the version payload and every other ` +
        '@payloadcms package in this manifest declare.',
    ).toBe(core)
  })

  it('resolves the S3 adapter from apps/web under plain Node', () => {
    const { status, stdout, stderr } = resolveFromAppInRealNode()
    expect(
      status,
      `require.resolve('${ADAPTER}') failed from ${APP_DIR}. ` +
        `Run pnpm install after adding the dependency. Node said: ${stderr.trim()}`,
    ).toBe(0)
    expect(stdout, 'require.resolve returned nothing').not.toBe('')
  })
})
