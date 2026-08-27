import { defineConfig } from 'vitest/config'

/**
 * T002 / FR-020 — the real suite for `@fablab/ui`, replacing `vitest run --passWithNoTests`.
 *
 * The flag it replaces is the point: with it, a suite that matches zero files exits 0, and the
 * root `pnpm test` (`pnpm -r --no-bail test`) reports success having executed nothing. Every
 * invariant this package owns — token values, contrast maths, the pixel clamp, the islands
 * audit — is a test file that must be *found* before it can fail.
 *
 * **No `environment` is set, deliberately.** Vitest defaults to `node`, and CLR-003 keeps the
 * stack locked: nothing here renders a component, so no `jsdom`/`happy-dom` dependency is
 * required. Rendering is feature 003's Playwright, not a devDependency added quietly here —
 * see plan § "What these tests can and cannot prove".
 */
export default defineConfig({
  test: {
    // Explicit and narrow. Vitest's default glob would also sweep `src/**`, so a fixture or a
    // scratch file named `*.test.ts` beside a component would silently join the suite; the
    // package keeps its tests in one directory instead.
    include: ['tests/**/*.test.ts'],
    // Serial, for the same reason apps/web is — a shared mutable resource — though the
    // resource here is the package tree itself, not a database.
    //
    // Three suites prove executed behaviour by writing probe files INSIDE the package and
    // running the real `tsc`/`eslint` over them: `src/__tsc_probe__`, `src/__eslint_probe__`
    // and `__colour_probe__`. They must live inside the package, because a probe outside it
    // would not pick up the tsconfig or the flat-config block under test — that is precisely
    // what makes these gates real rather than restatements.
    //
    // In parallel they sabotage each other. Measured: purity-boundary writes probes importing
    // `payload` and `node:fs`, and the tsconfig suite's "passes on the tree as committed"
    // case then runs `tsc` over a package containing them and fails — 10/10 in isolation,
    // 1 failed in the full run. Two working gates reporting a defect that belongs to neither.
    fileParallelism: false,
    // Some cases shell out to `tsc` and to `vitest list` to assert executed behaviour rather
    // than file text, which costs seconds rather than milliseconds. The default 5s timeout
    // would make those flaky on a cold or loaded machine.
    testTimeout: 30_000,
  },
})
