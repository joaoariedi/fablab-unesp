import type { PayloadRequest } from 'payload'

import { isMaster, tenantIdsOf } from './access'
import { getSystemScopedPayload, type MembershipRole } from './system-payload'
import { unscopedFindUserIdByEmail } from './unscoped'

/**
 * Invite orchestration (FR-021, FR-029).
 *
 * **[CF-7] Why this lives here and not in the route handler.** The work needs
 * `unscopedFindUserIdByEmail` and `getSystemScopedPayload`, both of which
 * `eslint.config.mjs` fences off from everything outside `lib/tenancy/`. Writing the
 * orchestration in the route would have made the route trip the very boundary it is meant
 * to respect — and the tempting fix, an `eslint-disable`, would have put the two most
 * dangerous functions in the codebase into a file anyone can edit. So the route calls one
 * exported function and imports nothing dangerous.
 *
 * **Scope in feature 000.** There is no e-mail transport: the compose file ships Postgres
 * and MinIO only, and no Payload email adapter is configured. So this resolves membership
 * and records the pending invite; delivery, token, expiry and the accept/set-password flow
 * are feature 004's, once a transport exists.
 */

export type InviteInput = {
  organizationId: string
  email: string
  role: MembershipRole
  invitedBy: string | number
  /** Propagated so the writes join the caller's transaction. */
  req?: PayloadRequest
}

/**
 * What actually happened. **Never sent to the client** — all three success branches return
 * the same `202` body (FR-021, SC-007). This exists so the server can log which path it
 * took without the response disclosing it.
 */
export type InviteOutcome =
  | 'membership-added'
  | 'already-member'
  | 'pending-invite-created'
  | 'already-invited'

type MaybeUser = { id?: string | number; role?: string; orgs?: { organization?: unknown; role?: string }[] } | null | undefined

/**
 * May this user invite into this organization? Master, or an `admin` of *that* organization.
 *
 * Being a member is not enough: a `maker` who could invite would be able to grant `admin` to
 * themselves via a second account.
 */
export function canInvite(user: MaybeUser, organizationId: string): boolean {
  if (!user) return false
  if (isMaster(user)) return true

  const membership = (user.orgs ?? []).find((row) => {
    const ref = row?.organization
    const id = typeof ref === 'object' && ref !== null && 'id' in ref ? ref.id : ref
    return String(id) === String(organizationId)
  })
  return membership?.role === 'admin'
}

/** Ids of the organizations a user could invite into. Used by tests and future admin UI. */
export const invitableOrganizations = (user: MaybeUser): (string | number)[] =>
  isMaster(user) ? [] : tenantIdsOf(user).filter((id) => canInvite(user, String(id)))

/**
 * Resolves an invitation. Authorisation is the caller's job — the route checks `canInvite`
 * *before* responding, because a `403` must not be deferred behind a `202`.
 *
 * @example
 *   const outcome = await resolveInvite({
 *     organizationId: '1', email: 'a@example.com', role: 'maker', invitedBy: req.user.id,
 *   })
 */
export async function resolveInvite(input: InviteInput): Promise<InviteOutcome> {
  const { organizationId, email, role, invitedBy, req } = input
  const sys = await getSystemScopedPayload(organizationId, { req })

  // Identity is global, so this asks "does this address already have an account anywhere?".
  // A tenant-scoped lookup would answer "not in this organization" and cheerfully create a
  // second account for someone who already exists — the outcome FR-021 forbids.
  const existingUserId = await unscopedFindUserIdByEmail(email)

  if (existingUserId !== null) {
    const added = await sys.addMembership(existingUserId, role)
    return added ? 'membership-added' : 'already-member'
  }

  // No account: record the intent only. **No `users` row is created before acceptance** —
  // the constitution makes terms acceptance a signup gate, and someone who never consented
  // should not exist as an account (FR-029).
  try {
    await sys.create({
      collection: 'pendingInvites',
      data: { email, role, invitedBy },
    })
    return 'pending-invite-created'
  } catch (err) {
    // A repeat invite is FR-021's no-op. The unique index on (tenant, email) is what makes
    // that race-free — insert-and-catch, rather than check-then-insert, which two concurrent
    // invites would both pass before either wrote.
    if (isUniqueViolation(err)) return 'already-invited'
    throw err
  }
}

/**
 * Did this write lose the race on the `(tenant, email)` unique index?
 *
 * **Payload does not let the driver error through.** `@payloadcms/drizzle`'s
 * `handleUpsertError` catches Postgres `23505`, maps the constraint to field names and
 * throws a fresh `ValidationError` — **discarding `code` and `constraint`**. So checking for
 * `23505` alone silently fails to detect the one case this function exists for, which is how
 * a "repeat invite is a no-op" contract turns into a 500 in production.
 *
 * Two detections, in order of reliability:
 *   1. the raw driver code, if any adapter ever surfaces it
 *   2. a `ValidationError` naming **both** columns of the composite index — the signature of
 *      that index specifically, and not of an ordinary single-field validation failure
 */
function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const e = current as { code?: string; message?: string; cause?: unknown }
    if (e.code === '23505' || e.code === 'SQLITE_CONSTRAINT_UNIQUE') return true
    if (typeof e.message === 'string' && /duplicate key value|unique constraint/i.test(e.message)) {
      return true
    }
    current = e.cause
  }

  const wrapped = err as {
    name?: string
    message?: string
    data?: { errors?: { path?: string }[] }
  }
  if (wrapped?.name !== 'ValidationError') return false

  const paths = (wrapped.data?.errors ?? []).map((e) => String(e?.path ?? '').toLowerCase())
  const haystack = paths.length > 0 ? paths.join(',') : String(wrapped.message ?? '').toLowerCase()

  // Both halves required: `email` alone is a plain format failure and must still surface.
  const namesTenant = /\btenant(_id)?\b/.test(haystack)
  const namesEmail = /\bemail\b/.test(haystack)
  return namesTenant && namesEmail
}
