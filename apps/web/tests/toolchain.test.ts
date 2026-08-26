import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The Node and pnpm versions are named in **three** files, each read by different tooling:
 *
 *   .tool-versions            asdf — what the maintainers actually run
 *   .nvmrc                    nvm / fnm / actions/setup-node
 *   package.json#packageManager   corepack and pnpm itself
 *
 * Three copies of one fact is a drift bug with a delay fuse: the moment they disagree,
 * "works on my machine" becomes untraceable, and the disagreement is invisible in review
 * because each file looks correct on its own.
 *
 * This test is the gate. It is deliberately in apps/web because that is where Vitest runs;
 * the files it reads are at the workspace root.
 *
 * Feature 000 hit this for real: the repo pinned Node 22 via `.nvmrc`, the machine ran
 * Node 26, and nothing noticed — `.nvmrc` is inert under asdf.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8')

/** Strips comments and blank lines, then parses `tool version` pairs. */
function parseToolVersions(contents: string): Map<string, string> {
  const pairs = new Map<string, string>()
  for (const line of contents.split('\n')) {
    const stripped = line.split('#')[0]?.trim()
    if (!stripped) continue
    const [tool, version] = stripped.split(/\s+/)
    if (tool && version) pairs.set(tool, version)
  }
  return pairs
}

describe('toolchain pins agree', () => {
  const toolVersions = parseToolVersions(read('.tool-versions'))
  const packageJson = JSON.parse(read('package.json')) as {
    packageManager?: string
    engines?: { node?: string }
  }

  it('.tool-versions declares both nodejs and pnpm', () => {
    expect(toolVersions.get('nodejs'), '.tool-versions is missing `nodejs`').toBeDefined()
    expect(toolVersions.get('pnpm'), '.tool-versions is missing `pnpm`').toBeDefined()
  })

  it('.nvmrc matches .tool-versions nodejs', () => {
    const nvmrc = read('.nvmrc').trim()
    expect(
      nvmrc,
      `.nvmrc (${nvmrc}) and .tool-versions nodejs (${toolVersions.get('nodejs')}) disagree. ` +
        `Bump both, or a contributor using nvm gets a different Node than one using asdf.`,
    ).toBe(toolVersions.get('nodejs'))
  })

  it('package.json packageManager matches .tool-versions pnpm', () => {
    const declared = packageJson.packageManager ?? ''
    const expected = `pnpm@${toolVersions.get('pnpm')}`
    expect(
      declared,
      `packageManager (${declared}) and .tool-versions pnpm (${toolVersions.get('pnpm')}) disagree. ` +
        `corepack would provision one version while asdf provides another.`,
    ).toBe(expected)
  })

  it('the pinned Node satisfies the declared engines range', () => {
    // engines is the floor other tools check; the pin must not fall below it.
    const nodePin = toolVersions.get('nodejs') ?? ''
    const major = Number(nodePin.split('.')[0])
    const engines = packageJson.engines?.node ?? '>=22'
    const floor = Number(engines.replace(/[^\d.]/g, '').split('.')[0])
    expect(
      major,
      `.tool-versions pins Node ${nodePin}, below package.json engines "${engines}".`,
    ).toBeGreaterThanOrEqual(floor)
  })
})
