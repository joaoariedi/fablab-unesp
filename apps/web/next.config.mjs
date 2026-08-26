import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Payload runs in this same process; its admin bundle is wired in by withPayload.

  // `next dev` otherwise writes apps/web/AGENTS.md + CLAUDE.md on every start. This repo
  // already carries its own contributor guidance, and a file the dev server rewrites is a
  // permanent uncommitted diff for everyone who runs it.
  agentRules: false,
}

export default withPayload(nextConfig)
