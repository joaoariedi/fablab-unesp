import type { CollectionConfig } from 'payload'

// PROBE of SC-004 — MUST FAIL CI. Deliberately absent from SCOPE_REGISTRY.
export const UnregisteredProbe: CollectionConfig = {
  slug: 'unregisteredProbe',
  fields: [{ name: 'label', type: 'text' }],
}
