/**
 * The public surface of the tenancy module.
 *
 * **What is deliberately absent is the point of this file.** `getSystemScopedPayload` and
 * everything in `unscoped.ts` are *not* re-exported: they run with access control off, and
 * the only way to reach them is an import that `eslint.config.mjs` rejects outside this
 * directory. Two locks on the same door — the export list and the import boundary — because
 * the failure they prevent is silent and the cost of a second lock is one line.
 *
 * See `contracts/tenancy.md` for the contract these exports satisfy.
 */

// The choke point — the only sanctioned path to Payload data.
export {
  getTenantScopedPayload,
  getTenantScopedPayloadForRSC,
  type ScopedPayloadOptions,
} from './scoped-payload'

export type {
  TenantScopedPayload,
  FindArgs,
  ByIDArgs,
  CreateArgs,
  UpdateArgs,
} from './client'

// Access factories — collections import these instead of writing their own.
export { isMaster, masterOnly, masterOrSelf, scopedAccess, tenantIdsOf } from './access'

// The relationship guard the plugin does not provide.
export { normalizeRefs, sameTenant } from './same-tenant-validator'

// Host resolution. `lookupOrganizationByHost` is exported for tests (spike S8's seam);
// `resolveTenant` is what production calls.
export {
  lookupOrganizationByHost,
  resolveTenant,
  TENANT_RESOLUTION_TAG,
  type HostLookup,
  type HostResolution,
  type ResolvedOrganization,
} from './resolve'

// The scope registry and its helpers.
export {
  globalCollections,
  isPayloadInternal,
  isScoped,
  PAYLOAD_INTERNAL_COLLECTIONS,
  registeredCollections,
  SCOPE_REGISTRY,
  scopedCollections,
  type RegisteredCollection,
  type Scope,
} from './scope-registry'

// Seed-on-create: features 005+ register their defaults through this.
export {
  revalidateTenantResolution,
  seedNewOrganization,
  SEED_ON_CREATE,
  type SeedFn,
} from './seed-on-create'

export { CrossTenantError, TenantUnresolvedError } from './errors'
