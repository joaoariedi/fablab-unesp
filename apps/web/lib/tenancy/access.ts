import type { Access, FieldAccess, Where } from 'payload'

/**
 * The shape access control may assume of `req.user` — deliberately all-optional, because it
 * is whatever the session deserialised to rather than a validated document.
 *
 * **`orgs[].role` is not new (T006, FR-008).** `payload.config.ts` declares it as a
 * `rowFields` select on the multi-tenant plugin's `orgs` array (`admin | staff | maker`,
 * required), and `invite.ts` has always read it. Only this type omitted it, which is why
 * the per-organization role looked absent from access control: a row typed
 * `{ organization?: unknown }` makes `row.role` a compile error, so `teamOnly` and
 * `canPublishField` had nothing to branch on. Typed `string`, not the three-value union, to
 * match the sibling shape in `invite.ts` and because the value arrives from a session, not
 * from a schema this code enforces.
 */
type MaybeUser =
  | { role?: string; orgs?: { organization?: unknown; role?: string }[] }
  | null
  | undefined

/** The only role that reads across organizations (FR-015). */
export const isMaster = (user: MaybeUser): boolean => user?.role === 'master'

type MembershipRow = NonNullable<NonNullable<MaybeUser>['orgs']>[number]

/**
 * One membership row's organization id, or `null` when the row names none.
 *
 * A relationship arrives either as a raw id or as a populated document depending on the
 * depth Payload resolved the session at, so both shapes are normalised here rather than at
 * each caller.
 */
const organizationIdOf = (row: MembershipRow | undefined): string | number | null => {
  const ref = row?.organization
  if (ref === null || ref === undefined) return null
  return typeof ref === 'object' && 'id' in ref ? (ref.id as string | number) : (ref as string | number)
}

/** The organization ids a user belongs to, normalised from id-or-populated-object rows. */
export const tenantIdsOf = (user: MaybeUser): (string | number)[] =>
  (user?.orgs ?? [])
    .map(organizationIdOf)
    .filter((id): id is string | number => id !== null)

/** The roles that make up the lab team; `maker` submits for review and cannot publish. */
const TEAM_ROLES = new Set(['admin', 'staff'])

/** The one restricted value of `status` (FR-008). `rascunho` and `em_revisao` are the queue. */
const PUBLISHED_STATUS = 'publicado'

/**
 * The `status` value this write is trying to set, or `undefined` when it sets none.
 *
 * `siblingData` first: for a `status` nested in a group or a row it is the only object that
 * carries the field, while `data` is the whole document. For a top-level `status` the two are
 * the same object, so the order costs nothing and covers both shapes.
 */
const statusBeingWritten = (siblingData: unknown, data: unknown): unknown => {
  const sibling = (siblingData as { status?: unknown } | undefined)?.status
  return sibling ?? (data as { status?: unknown } | undefined)?.status
}

/** The organization ids where the user holds a team role — the predicate FR-008 turns on. */
const teamTenantIdsOf = (user: MaybeUser): (string | number)[] =>
  (user?.orgs ?? [])
    .filter((row) => TEAM_ROLES.has(row?.role ?? ''))
    .map(organizationIdOf)
    .filter((id): id is string | number => id !== null)

/**
 * A document's `tenant` as a comparable id, or `null` when it names none.
 *
 * Compared as a string because the two sides come from different places — a session's
 * membership row and a stored document — and one may have been serialised through JSON while
 * the other kept its numeric id. `sameTenant`'s `asId` normalises for the same reason.
 */
const tenantRefOf = (ref: unknown): string | null => {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object' && 'id' in ref) return String((ref as { id: unknown }).id)
  return String(ref)
}

/**
 * Access on a scoped collection returns a **query constraint, never a boolean** (FR-015).
 *
 * The distinction is the whole point: a boolean authorises the *operation* and then leaks
 * every *row*; a constraint makes `find` safe by construction, because the filter travels
 * with the query instead of being checked beside it.
 *
 * **[CF-9] "except master" made explicit.** `master` is the single exception, and it
 * returns `true` rather than a constraint — deliberately, because the constraint it would
 * otherwise need is "no constraint". Spike S3 confirmed the plugin composes this correctly:
 * when `userHasAccessToAllTenants` is true it adds **no** tenant clause at all.
 */
export const scopedAccess = (): Access => ({ req }) => {
  const user = req?.user as MaybeUser
  if (!user) return false
  if (isMaster(user)) return true

  const ids = tenantIdsOf(user)
  // A user with no memberships can authenticate but sees no scoped data (data-model
  // invariant 3). Returning an empty `in` would match nothing anyway; `false` says so
  // plainly and produces a 403 rather than a silent empty page.
  if (ids.length === 0) return false

  /* @isolation-mutation-point */
  return { tenant: { in: ids } } as Where
}

/**
 * Global collections that only a master may enumerate (FR-022).
 *
 * Organization admins must not list `organizations` or `users`: knowing which other
 * organizations exist, or which addresses hold accounts, is precisely the enumeration US8
 * forbids. Their own organization reaches them through host resolution, which runs inside
 * `lib/tenancy` on the allowlisted path.
 */
export const masterOnly = (): Access => ({ req }) => isMaster(req?.user as MaybeUser)

/**
 * `users` is global, so it cannot carry a tenant constraint — but a signed-in user must
 * still be able to read their own row (Payload's auth needs it, and the spike confirmed the
 * plugin already permits exactly this).
 */
export const masterOrSelf = (): Access => ({ req }) => {
  const user = req?.user as MaybeUser & { id?: string | number }
  if (!user) return false
  if (isMaster(user)) return true
  return { id: { equals: user.id } } as Where
}

/**
 * Who may publish (FR-008, SC-005) — the lab team, **scoped to their own labs**.
 *
 * `admin` and `staff` are the team; a `maker` writes drafts and submits them for review, so
 * their memberships are filtered out entirely.
 *
 * **Why a constraint and not `true`.** Membership is per organization, so the answer "yes,
 * this user is staff" is only half of it: a staff member of lab A must not be able to publish
 * lab B's content, and returning a boolean would authorise the operation while leaving every
 * row to whatever filter the caller happened to apply. Returning `{ tenant: { in: [A] } }`
 * makes the wrong rows unreachable even when a route forgets to scope its own query — the
 * same reasoning as `scopedAccess`, applied to the narrower set of team memberships.
 *
 * `master` is the single exception and returns `true`, matching `scopedAccess`: the plugin
 * adds no tenant clause for a user with access to all tenants (spike S3).
 */
export const teamOnly = (): Access => ({ req }) => {
  const user = req?.user as MaybeUser
  if (isMaster(user)) return true

  const teamOrgs = teamTenantIdsOf(user)

  // No team membership anywhere: `false` produces a 403 rather than an empty `in` that would
  // silently match nothing and read as "published nothing" instead of "may not publish".
  if (teamOrgs.length === 0) return false

  return { tenant: { in: teamOrgs } } as Where
}

/**
 * The `status` field guard (FR-008, SC-005) — the boolean half of the same rule.
 *
 * **Why this is a second function and not `teamOnly` reused.** Payload types field access as
 * `FieldAccess = (args) => boolean | Promise<boolean>`; it has no place to put a `Where`, so
 * the move `teamOnly` makes — answer with a constraint and let the query carry the scope — is
 * simply unavailable one level down. Handing `teamOnly` to `access.update` on a field would
 * not typecheck, and coercing it would silently publish the constraint object as a truthy
 * `true`: staff of any lab publishing every lab's content. The two share `TEAM_ROLES` and
 * nothing else.
 *
 * So the scope has to be decided *inside* the boolean, against the tenant of the document
 * actually being written: `doc` on an update, `data` on a create. `doc` is read first
 * deliberately — it is the stored row, whereas `data` is attacker-shaped input, and a maker
 * of lab B who could name lab A in the payload would publish by claiming a tenant they are
 * staff of. Same reasoning as `sameTenant`, which falls back to the stored tenant for exactly
 * this reason.
 *
 * **When no tenant can be determined at all** (a partial update that sends only the changed
 * field, so neither side names one) the answer given is the one that holds whichever document
 * it turns out to be: the user is on the team in *every* organization they belong to.
 * Refusing outright would break a legitimate publish; trusting "on some team" would let a
 * maker of lab B publish there because they are staff of lab A.
 */
export const canPublishField: FieldAccess = ({ req, doc, data, siblingData }) => {
  const user = req?.user as MaybeUser
  if (!user) return false

  // **The value, not merely the field.** FR-008's workflow is `rascunho → em_revisao →
  // publicado`, and only the last hop belongs to the lab team: the product spec is explicit
  // that "qualquer maker logado envia; a equipe aprova e publica". A version of this function
  // that asked only "may this user write `status` at all" refused the maker's own *submit*,
  // which made the review queue — the whole point of the middle state — unreachable by the
  // person who is supposed to fill it. Nothing in the suite noticed, because no test passed a
  // status value; the rule was invisible to its own tests.
  //
  // Field access is the only layer that can draw this distinction: `FieldAccessArgs` carries
  // the incoming value, and the plan deliberately rejected doing it in a hook, where the write
  // has already been shaped.
  if (statusBeingWritten(siblingData, data) !== PUBLISHED_STATUS) return true

  if (isMaster(user)) return true

  const teamOrgs = teamTenantIdsOf(user)
  if (teamOrgs.length === 0) return false

  // Not `doc?.tenant ?? data?.tenant`: a stored document that somehow names no tenant would
  // then fall through to the incoming payload, which is the one input the caller controls.
  // When there is a `doc` it is the only source consulted; the unknown-tenant branch below is
  // the safe answer for everything else.
  const source = doc ? (doc as { tenant?: unknown }) : (data as { tenant?: unknown } | undefined)
  const tenant = tenantRefOf(source?.tenant)
  if (tenant === null) return teamOrgs.length === tenantIdsOf(user).length

  return teamOrgs.some((id) => String(id) === tenant)
}
