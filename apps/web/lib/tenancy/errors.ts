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
