import { describe, expect, it } from 'vitest'

/**
 * T001b / FR-018 — `@fablab/ui` ships **source**, so the app's build must compile it.
 *
 * The package has no build step: its export map points at `./src/*.ts(x)` and `./src/styles.css`
 * (see `packages/ui/tests/package-exports.test.ts`). Next only compiles a dependency it is told
 * to, hence `transpilePackages`.
 *
 * **What was measured, because the plan's claim rested on reading rather than running.** The
 * task's acceptance was a real `pnpm --filter @fablab/web build` of a page importing a token
 * (raw `.ts`) and a component (raw `.tsx` that itself imports raw `.css`) from `@fablab/ui`.
 * That build was run under both install layouts, with the flag as the only variable, on
 * Next 16.3.3:
 *
 *   symlinked (what `pnpm install` produces here)
 *     Turbopack, with `transpilePackages`  → compiled, type-checked, prerendered the route
 *     Turbopack, without                   → identical result
 *     webpack (`--webpack`), without       → identical result
 *   copied (a real directory under node_modules, made by hand and reverted)
 *     Turbopack, without `transpilePackages` → BUILD FAILED, "Unknown module type" on the
 *                                              package's raw `src/tokens/index.ts`
 *     Turbopack, with it                     → compiled and prerendered
 *
 * So the flag is load-bearing, and which layout is installed — not which bundler runs — is what
 * decides whether it matters. Under pnpm's layout `apps/web/node_modules/@fablab/ui` is a
 * **symlink** to `packages/ui`, which both bundlers resolve to a real path *outside*
 * `node_modules`, where source is compiled as app code; the flag is redundant there and only
 * there. Nothing in this repo pins that layout: `node-linker=hoisted` or a `pnpm deploy` copy
 * puts a real directory back under `node_modules`, which is the failing row above.
 *
 * Two claims earlier revisions of this docstring made are corrected here: `--webpack` does not
 * change the outcome (row 3), and the copied layout is no longer "the untested reason the flag
 * stays" — it was measured, and it fails without the flag.
 *
 * This test was watched go red (`expected undefined to be defined`) with the flag deleted from
 * `next.config.mjs`, so it is a gate someone has seen fail — not one assumed to work.
 *
 * It asserts the config **after `withPayload()` has wrapped it** rather than grepping the file:
 * the wrapper returns a new object and merges its own keys (`serverExternalPackages`, `turbopack`,
 * `webpack`, …), so a text match on the source would keep passing even if the wrapper dropped or
 * overwrote the value Next actually receives.
 */

const UI_PACKAGE = '@fablab/ui'

/** Only the keys this test reads; the resolved config carries many more. */
interface ResolvedNextConfig {
  readonly transpilePackages?: readonly string[]
  readonly serverExternalPackages?: readonly string[]
}

async function loadResolvedConfig(): Promise<ResolvedNextConfig> {
  const module = (await import('../next.config.mjs')) as { default: ResolvedNextConfig }
  return module.default
}

describe('apps/web transpiles @fablab/ui', () => {
  it('lists @fablab/ui in transpilePackages, as Next receives it', async () => {
    const { transpilePackages } = await loadResolvedConfig()
    expect(
      transpilePackages,
      'next.config.mjs declares no transpilePackages. @fablab/ui exports raw TS and CSS; ' +
        'any install layout that puts a real directory under node_modules fails to parse it.',
    ).toBeDefined()
    expect(
      transpilePackages,
      `transpilePackages is ${JSON.stringify(transpilePackages)}, which omits ${UI_PACKAGE}.`,
    ).toContain(UI_PACKAGE)
  })

  it('does not also mark @fablab/ui as a server external package', async () => {
    const { serverExternalPackages } = await loadResolvedConfig()
    // Payload populates this list. An entry here means "do not bundle, require() at runtime" —
    // the exact opposite instruction, and for a package of raw .ts it is a runtime crash in the
    // server build rather than a build error anyone would see in CI.
    expect(
      serverExternalPackages ?? [],
      `${UI_PACKAGE} is in serverExternalPackages, contradicting transpilePackages: Node would ` +
        'be asked to require raw TypeScript at request time.',
    ).not.toContain(UI_PACKAGE)
  })
})
