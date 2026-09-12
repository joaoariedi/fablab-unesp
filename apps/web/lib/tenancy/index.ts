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

// The shared tenant-scoped read endpoint — gives the harness's customEndpoint surface a
// real subject on every scoped collection (CF-9).
export { scopedListEndpoint } from './scoped-endpoint'

// Invite orchestration. [CF-7] The route handler calls this and imports nothing fenced —
// the dangerous functions it needs stay inside this directory.
export {
  canInvite,
  invitableOrganizations,
  resolveInvite,
  type InviteInput,
  type InviteOutcome,
} from './invite'

// Seed-on-create: features 005+ register their defaults through this.
export {
  revalidateTenantResolution,
  seedNewOrganization,
  SEED_ON_CREATE,
  type SeedFn,
} from './seed-on-create'

// The signup door. Exported like `invite` and for the same reason: the orchestration lives
// outside this directory (`lib/accounts/signup.ts`) and must not import anything fenced, so the
// narrow client is offered here while `system-payload` — which it is built on — stays behind the
// import fence. It is deliberately NOT a general client: three operations, one host-resolved
// tenant, no `update` and no `delete`. See the module docblock for why each bound is there.
export { getSignupScopedPayload, type SignupScopedPayload, type ContaCriada } from './signup-payload'

// The erasure door. Same reasoning as the signup door above, and the same fence: the
// orchestration lives in `lib/accounts/deletion.ts` and must not import `system-payload`.
// Bounded by OWNERSHIP rather than by host — every maker of a lab shares a host, so the proof
// that unseals it is "this profile is yours", checked before anything is handed back.
export {
  getErasureScopedPayload,
  ErasureNotOwnedError,
  type ErasureScopedPayload,
} from './erasure-payload'

export { CrossTenantError, TenantUnresolvedError } from './errors'
