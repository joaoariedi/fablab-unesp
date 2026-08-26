import type { Access, Where } from 'payload'

type MaybeUser = { role?: string; orgs?: { organization?: unknown }[] } | null | undefined

/** The only role that reads across organizations (FR-015). */
export const isMaster = (user: MaybeUser): boolean => user?.role === 'master'

/** The organization ids a user belongs to, normalised from id-or-populated-object rows. */
export const tenantIdsOf = (user: MaybeUser): (string | number)[] => {
  const rows = user?.orgs ?? []
  return rows
    .map((row) => {
      const ref = row?.organization
      if (ref === null || ref === undefined) return null
      return typeof ref === 'object' && 'id' in ref ? (ref.id as string | number) : (ref as string | number)
    })
    .filter((id): id is string | number => id !== null)
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
