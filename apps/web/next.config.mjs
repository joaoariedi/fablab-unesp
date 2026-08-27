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
  // Measured on Next 16.3.3 (T001b's acceptance was a real build, not a reading): a page
  // importing a token and a component from the package builds and prerenders *with or
  // without* this line. pnpm links `node_modules/@fablab/ui` as a symlink to `packages/ui`
  // and Turbopack follows it to a path outside `node_modules`, where source is compiled by
  // default. The line stays because that immunity belongs to the install layout, not to the
  // package: a hoisted install, a `pnpm deploy` copy, or a `--webpack` build all put a real
  // directory back under `node_modules`, and there raw TypeScript is a parse error.
  transpilePackages: ['@fablab/ui'],
}

export default withPayload(nextConfig)
