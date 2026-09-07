/**
 * Tenancy failures are **loud by construction**.
 *
 * The whole design rests on one asymmetry: a missing tenant must never degrade into "all
 * tenants". A thrown error is noisy and gets fixed; a silent widening returns a neighbour's
 * rows with HTTP 200 and gets noticed by the neighbour.
 */

/** No organization could be resolved for the request. Route handlers turn this into a 404. */
export class TenantUnresolvedError extends Error {
  readonly host: string | null

  constructor(host: string | null) {
    super(
      host
        ? `No active organization resolves for host "${host}".`
        : `No host on the request, so no organization can be resolved.`,
    )
    this.name = 'TenantUnresolvedError'
    this.host = host
  }
}

/** A caller tried to reach across organizations without being master. */
export class CrossTenantError extends Error {
  constructor(detail: string) {
    super(`Cross-tenant access denied: ${detail}`)
    this.name = 'CrossTenantError'
  }
}

/**
 * The anonymous read path was asked for a collection it is not allowed to serve.
 *
 * Exists because the alternative is the failure this module's whole design is against: the
 * public client runs with `overrideAccess: true`, so a collection it cannot *constrain* is a
 * collection it would return in full to a visitor with no session. Two measured examples —
 * `pendingInvites` is scoped but carries no `status`, so a status filter cannot be built for
 * it and every invite e-mail and role of the host's organization would be served; `users` is
 * `global`, so it gets no tenant constraint either, and the whole platform's accounts would be.
 *
 * Denying by default means a collection becomes publicly readable by an explicit act, never by
 * the omission of a field.
 */
export class PublicReadDeniedError extends Error {
  readonly collection: string

  constructor(collection: string, reason: string) {
    super(
      `The anonymous read path refuses "${collection}": ${reason}. ` +
        'Public reads are allow-listed — a collection is served only when it can be confined ' +
        'to the host organization AND filtered to published rows.',
    )
    this.name = 'PublicReadDeniedError'
    this.collection = collection
  }
}

/**
 * The anonymous **write** path was asked for something other than the single column of the
 * single row it was opened for (FR-016, T036).
 *
 * US4 is the only anonymous write in the product: a download is served to a visitor with no
 * session and the counter must move with it. That means a client with `update` on it, running
 * `overrideAccess: true`, reachable by a request nobody authenticated — so whatever it *can*
 * write, an anonymous caller can write. The tenant constraint alone is not enough: it would
 * still leave `status: 'publicado'` on any row of the host organization within reach of the
 * download endpoint, which is SC-005 fenced around through the one door FR-015 has to leave
 * open.
 *
 * So the store is opened for one collection, one id and one field, and every other operation
 * raises this. Narrow by construction rather than by the caller remembering to be careful.
 */
export class PublicWriteDeniedError extends Error {
  readonly attempted: string

  constructor(attempted: string, reason: string) {
    super(
      `The anonymous write path refuses ${attempted}: ${reason}. ` +
        'It is opened for exactly one column of one document — the counter of a download ' +
        'that has already been resolved through the public read path.',
    )
    this.name = 'PublicWriteDeniedError'
    this.attempted = attempted
  }
}
