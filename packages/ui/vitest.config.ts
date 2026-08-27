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
    // Some cases shell out to `tsc` and to `vitest list` to assert executed behaviour rather
    // than file text, which costs seconds rather than milliseconds. The default 5s timeout
    // would make those flaky on a cold or loaded machine.
    testTimeout: 30_000,
  },
})
