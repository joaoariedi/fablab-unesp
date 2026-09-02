import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Payload runs in this same process; its admin bundle is wired in by withPayload.

  // `next dev` otherwise writes apps/web/AGENTS.md + CLAUDE.md on every start. This repo
  // already carries its own contributor guidance, and a file the dev server rewrites is a
  // permanent uncommitted diff for everyone who runs it.
  agentRules: false,

  // `@fablab/ui` has no build step: its export map points at raw `.ts`, `.tsx` and `.css`
  // under `packages/ui/src/`, so whoever bundles the app has to compile it.
  //
  // Measured on Next 16.3.3 (T001b's acceptance was a real build, not a reading). Every run
  // below built a probe route importing a token (raw `.ts`) and a component (raw `.tsx` that
  // itself imports a CSS module) from the package, with the flag as the only variable:
  //
  //   symlinked (what `pnpm install` produces here)
  //     Turbopack, with the flag        → built, /ui-probe prerendered static
  //     Turbopack, without              → identical
  //     webpack (`--webpack`), without  → identical
  //   copied (a real directory under node_modules)
  //     Turbopack, without the flag     → BUILD FAILED, "Unknown module type" on
  //                                       src/tokens/index.ts and src/components/index.ts
  //     Turbopack, with the flag        → built, /ui-probe prerendered static
  //
  // So what decides it is pnpm's install layout, not the bundler: `apps/web/node_modules/
  // @fablab/ui` is a **symlink** to `packages/ui`, and both bundlers resolve it to a real path
  // outside `node_modules`, where source is compiled as app code by default. That immunity
  // belongs to the layout, which nothing in this repo pins — `node-linker=hoisted` or a
  // `pnpm deploy` copy puts a real directory back under `node_modules`, and the run above is
  // what happens there: raw TypeScript is not a parse error but a module Turbopack refuses to
  // classify at all. The flag is the difference between those last two lines.
  //
  // Both earlier revisions of this comment are corrected here: one blamed `--webpack` (row 3
  // falsifies it — the bundler never changed the layout), and one called the copied layout the
  // *untested* reason to keep the flag. It is tested; the copy was made by hand and reverted.
  transpilePackages: ['@fablab/ui'],
}

export default withPayload(nextConfig)
