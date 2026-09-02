import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `apps/web` must be able to import `@fablab/ui`.
 *
 * Round 4 measured that it could not: `apps/web/node_modules/@fablab/` did not exist and
 * `require.resolve('@fablab/ui')` from the app returned MODULE_NOT_FOUND. The package
 * itself was fine — the missing line was on the *consumer* side, a `workspace:*` entry in
 * the app's dependencies. Every import this feature adds sits downstream of it.
 *
 * Resolution is checked in a **child Node process, not in-process**. Vitest patches CJS
 * resolution to go through Vite's resolver, and an in-process `require.resolve('@fablab/ui')`
 * returned the real file path while a plain `node -e` from the same directory still failed
 * with MODULE_NOT_FOUND — i.e. the in-process check passes with the dependency absent and
 * asserts nothing. `next build` and `payload` run under plain Node, so plain Node is the
 * resolver that has to succeed.
 *
 * Declaring the dependency is also not sufficient on its own: pnpm only creates the
 * `apps/web/node_modules/@fablab/ui` link at install time.
 */

const APP_DIR = join(import.meta.dirname, '..')

/** `require.resolve('@fablab/ui')` as a plain Node process rooted in apps/web would see it. */
function resolveFromAppInRealNode(): { status: number | null; stdout: string; stderr: string } {
  const script =
    "const {createRequire} = require('node:module');" +
    'const req = createRequire(process.argv[1]);' +
    "process.stdout.write(req.resolve('@fablab/ui'));"
  const result = spawnSync(process.execPath, ['-e', script, join(APP_DIR, 'package.json')], {
    cwd: APP_DIR,
    encoding: 'utf8',
    // Vitest exports a NODE_PATH pointing into `node_modules/.pnpm/node_modules`, pnpm's
    // hidden hoist directory, which already contains a link to every workspace package.
    // Inheriting it made this check pass with the dependency undeclared. Clear it so the
    // child resolves the way a plain `next build` shell does.
    env: { ...process.env, NODE_PATH: '' },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('apps/web depends on @fablab/ui', () => {
  it('declares @fablab/ui as a workspace dependency', () => {
    const manifest = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(
      manifest.dependencies?.['@fablab/ui'],
      'apps/web/package.json does not list @fablab/ui in dependencies. ' +
        'Without it pnpm links nothing and every import in this feature fails.',
    ).toBe('workspace:*')
  })

  it('resolves @fablab/ui from apps/web under plain Node', () => {
    const { status, stdout, stderr } = resolveFromAppInRealNode()
    expect(
      status,
      `require.resolve('@fablab/ui') failed from ${APP_DIR}. ` +
        `Run pnpm install after adding the dependency. Node said: ${stderr.trim()}`,
    ).toBe(0)
    expect(stdout, 'require.resolve returned nothing').not.toBe('')
  })

  it('resolves @fablab/ui to the workspace package, not a copy', () => {
    const { stdout } = resolveFromAppInRealNode()
    expect(
      stdout.endsWith(join('packages', 'ui', 'src', 'index.ts')),
      `@fablab/ui resolved to "${stdout}", which is not packages/ui/src/index.ts. ` +
        'The app must link the workspace package so edits there are seen without a publish.',
    ).toBe(true)
  })
})
