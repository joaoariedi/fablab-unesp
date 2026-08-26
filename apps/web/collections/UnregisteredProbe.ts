import type { CollectionConfig } from 'payload'

// PROBE of SC-004 — MUST FAIL CI.
// A collection deliberately absent from SCOPE_REGISTRY. Nobody declared whether it is
// scoped or global, so nobody decided whether it leaks across organizations. The registry
// test must refuse the build and name it.
export const UnregisteredProbe: CollectionConfig = {
  slug: 'unregisteredProbe',
  fields: [{ name: 'label', type: 'text' }],
}
