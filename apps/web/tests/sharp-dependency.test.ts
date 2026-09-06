import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import configPromise from '../payload.config'

/**
 * FR-011 / SC-006: image uploads carry a declared allowlist and the derivatives the cards
 * render. Payload generates none of that itself — it delegates every image operation to
 * `sharp`, and only when `sharp` is handed to `buildConfig`. Spike S1
 * (`.specify/specs/002-cms-conteudo/spikes/S1-imagesizes.md`) measured it absent from both
 * `apps/web/package.json` and the config, which makes `imageSizes` a no-op on every path:
 * the size fields exist on the document and stay empty forever.
 *
 * Two halves, and neither is sufficient alone. A declared dependency nobody passes to
 * `buildConfig` leaves Payload with no image pipeline; a config that references `sharp`
 * without the dependency declared fails at `next build`, where devDependencies are absent.
 *
 * Resolution is checked in a **child Node process, not in-process** — the lesson
 * `ui-dependency.test.ts` paid for in feature 001 round 4 and `storage-dependency.test.ts`
 * repeats. Vitest patches CJS resolution through Vite's resolver and exports a NODE_PATH
 * pointing at pnpm's hidden hoist directory, so an in-process `require.resolve` succeeds
 * with the dependency undeclared and asserts nothing. `next build` runs under plain Node.
 *
 * `sharp` is loaded through `config.sharp` rather than imported here on purpose: an
 * undeclared module would fail this file at import time, which reports as a collection
 * error rather than as the assertion that names what is missing.
 */

const APP_DIR = join(import.meta.dirname, '..')
const SHARP = 'sharp'

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const manifest = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as Manifest

/**
 * A 4x4 solid-colour PNG, inline so this test needs no filesystem fixture and no image
 * library other than the one under test to produce its own input.
 */
const SOURCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAA' +
    'EElEQVQI12M4IScHRwzEcQCxYxBB8CINGAAAAABJRU5ErkJggg==',
  'base64',
)

/** `require.resolve('sharp')` as a plain Node process rooted in apps/web would see it. */
function resolveFromAppInRealNode(): { status: number | null; stdout: string; stderr: string } {
  const script =
    "const {createRequire} = require('node:module');" +
    'const req = createRequire(process.argv[1]);' +
    `process.stdout.write(req.resolve(${JSON.stringify(SHARP)}));`
  const result = spawnSync(process.execPath, ['-e', script, join(APP_DIR, 'package.json')], {
    cwd: APP_DIR,
    encoding: 'utf8',
    // Cleared for the same reason as in storage-dependency.test.ts: inheriting Vitest's
    // NODE_PATH makes this check pass with nothing declared.
    env: { ...process.env, NODE_PATH: '' },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('apps/web depends on sharp', () => {
  it('declares sharp as a runtime dependency', () => {
    expect(
      manifest.dependencies?.[SHARP],
      'apps/web/package.json does not list sharp in dependencies. Payload has no image ' +
        'pipeline without it, so FR-011 derivatives are never generated (spike S1).',
    ).toBeDefined()
    expect(
      manifest.devDependencies?.[SHARP],
      'sharp is a devDependency. Production installs omit those, and the image pipeline ' +
        'is loaded by next build and by every payload command that touches an upload.',
    ).toBeUndefined()
  })

  it('resolves sharp from apps/web under plain Node', () => {
    const { status, stdout, stderr } = resolveFromAppInRealNode()
    expect(
      status,
      `require.resolve('${SHARP}') failed from ${APP_DIR}. ` +
        `Run pnpm install after adding the dependency. Node said: ${stderr.trim()}`,
    ).toBe(0)
    expect(stdout, 'require.resolve returned nothing').not.toBe('')
  })

  it('hands sharp to buildConfig', async () => {
    const config = await configPromise
    expect(
      typeof config.sharp,
      'payload.config.ts does not pass `sharp` to buildConfig. Declaring the dependency ' +
        'without wiring it leaves imageSizes and every derivative a no-op (spike S1).',
    ).toBe('function')
  })

  it('wires a sharp that actually decodes and resizes an image', async () => {
    // Declaration and wiring can both be present while the native binding fails to load —
    // sharp is the one dependency in this app with a compiled libvips underneath it, and a
    // `typeof === 'function'` check calls that green. Drive the exact operation FR-011
    // needs: decode uploaded bytes, then emit a smaller derivative.
    const config = await configPromise
    const original = await config.sharp(SOURCE_PNG).metadata()
    expect([original.format, original.width, original.height]).toEqual(['png', 4, 4])

    const thumbnail = await config.sharp(SOURCE_PNG).resize(2, 2).png().toBuffer()
    const derived = await config.sharp(thumbnail).metadata()
    expect(
      [derived.width, derived.height],
      'sharp returned bytes it could not read back as a 2x2 image',
    ).toEqual([2, 2])
  })
})
