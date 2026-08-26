/**
 * The versioned scope registry (FR-017).
 *
 * Every collection is declared `scoped` or `global` with a one-line justification, and a
 * test fails when the registry and the Payload config disagree in **either** direction
 * (FR-018). The point is not documentation: it is that a contributor who adds a collection
 * in 2027 is stopped by CI rather than by review luck, and that moving a collection between
 * scopes shows up as an explicit diff someone has to defend.
 *
 * `SCOPE_REGISTRY` is also consulted at runtime by the tenancy choke point, so a `global`
 * collection is never tenant-stamped on create and never tenant-filtered on read.
 */

export type Scope = 'scoped' | 'global'

export type ScopeEntry = {
  scope: Scope
  why: string
}

export const SCOPE_REGISTRY = {
  organizations: {
    scope: 'global',
    why: 'It *is* the tenant — scoping it to itself is circular',
  },
  users: {
    scope: 'global',
    why: 'Identity is platform-wide (one e-mail = one account); role lives per membership',
  },
  tenantCanaries: {
    scope: 'scoped',
    why: 'Gives the guardrails a real subject to be tested against (FR-028)',
  },
  pendingInvites: {
    scope: 'scoped',
    why: 'An invite belongs to the organization that issued it (FR-029)',
  },
} as const satisfies Record<string, ScopeEntry>

/**
 * Collections Payload creates for itself. They are **not** ours to declare `scoped` or
 * `global`: we do not author their fields and an upgrade can change them underneath us.
 *
 * This list is explicit rather than a `payload-` prefix match, so that a **new** internal
 * collection introduced by a future Payload upgrade fails `registry.test.ts` and gets
 * looked at, instead of being silently absorbed by a wildcard.
 *
 * ⚠ Two of these reference *our* documents and are therefore a real isolation surface, not
 * bookkeeping:
 *   - `payload-locked-documents` holds references to documents being edited, including
 *     scoped ones — readable rows here could let one organization enumerate another's
 *     document IDs.
 *   - `payload-preferences` is per-user admin state, keyed by user.
 * Neither is covered by the tenant plugin's access composition. Feature 000 does not close
 * this; the isolation harness (T049–T052) must decide whether to assert against them, and
 * the answer belongs in the plan before feature 002 adds real scoped content.
 */
export const PAYLOAD_INTERNAL_COLLECTIONS = [
  'payload-kv',
  'payload-locked-documents',
  'payload-migrations',
  'payload-preferences',
] as const

export const isPayloadInternal = (slug: string): boolean =>
  (PAYLOAD_INTERNAL_COLLECTIONS as readonly string[]).includes(slug)

export type RegisteredCollection = keyof typeof SCOPE_REGISTRY

const entries = Object.entries(SCOPE_REGISTRY) as [RegisteredCollection, ScopeEntry][]

/**
 * True when a collection carries a plugin-injected `tenant` field.
 *
 * The choke point calls this before stamping or filtering. An **unregistered** slug returns
 * `false`, which is the safe direction for reads — but it is not a licence to skip the
 * registry: `registry.test.ts` fails the build for any collection missing from this file,
 * so an unregistered slug should never reach production.
 *
 * @example
 *   isScoped('tenantCanaries') // true
 *   isScoped('organizations')  // false
 */
export const isScoped = (slug: string): boolean =>
  SCOPE_REGISTRY[slug as RegisteredCollection]?.scope === 'scoped'

/** Every collection declared `scoped`. The isolation harness iterates exactly this list. */
export const scopedCollections = (): RegisteredCollection[] =>
  entries.filter(([, e]) => e.scope === 'scoped').map(([slug]) => slug)

/** Every collection declared `global`. */
export const globalCollections = (): RegisteredCollection[] =>
  entries.filter(([, e]) => e.scope === 'global').map(([slug]) => slug)

/** Every slug the registry knows, in declaration order. */
export const registeredCollections = (): RegisteredCollection[] => entries.map(([slug]) => slug)
