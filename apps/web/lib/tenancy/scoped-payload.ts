import { getPayload, type PayloadRequest } from 'payload'

import { buildTenantClient, type TenantScopedPayload } from './client'
import { TenantUnresolvedError } from './errors'
import { resolveTenant, type HostLookup } from './resolve'

/**
 * The choke point (FR-013). Nothing outside `lib/tenancy/` reaches Payload data except
 * through this.
 *
 * Two properties do the work:
 *   1. `overrideAccess: false` is stated **once**, here. Payload's Local API skips access
 *      control by default, so the dangerous call is a clean `payload.find()` carrying no
 *      suspicious token — verified live during the spike, where a bare find returned both
 *      organizations' rows.
 *   2. The tenant filter is applied *in addition to* the plugin's own access composition.
 *      Spike S3 confirmed the plugin AND-combines rather than replaces, so the two
 *      intersect and either one surviving a misconfiguration still holds the line.
 */

/**
 * **[N4] The host comes from the request, with `next/headers` only as a fallback.**
 *
 * Binding this to `next/headers` unconditionally would throw outside a Next request scope —
 * including inside Vitest, where the harness's own `localApiAsRsc` surface runs. Spike S8
 * measured that: `headers()` throws `called outside a request scope`.
 */
function hostFromRequest(req: PayloadRequest): string | null {
  const headers = req?.headers
  if (!headers) return null
  // `x-tenant-host` is set by proxy.ts, which also strips any client-supplied `x-tenant`.
  return headers.get('x-tenant-host') ?? headers.get('host') ?? null
}

export type ScopedPayloadOptions = {
  /** Injectable so tests can resolve without `next/cache` (spike S8). */
  lookup?: HostLookup
  /** Overrides host detection. Used by the harness to drive a specific organization. */
  host?: string
}

/**
 * Request-scoped client. This is the calling convention for **route handlers and hooks**,
 * which already hold a `PayloadRequest`.
 *
 * @example
 *   const db = await getTenantScopedPayload(req)
 *   const rows = await db.find({ collection: 'tenantCanaries' })
 */
export async function getTenantScopedPayload(
  req: PayloadRequest,
  options: ScopedPayloadOptions = {},
): Promise<TenantScopedPayload> {
  const host = options.host ?? hostFromRequest(req)
  const organization = await resolveTenant(host ?? '', options.lookup)

  // An unresolved tenant is an error, never a silent "all tenants". This is the single
  // asymmetry the whole design rests on.
  if (!organization) throw new TenantUnresolvedError(host)

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  return buildTenantClient({
    payload,
    tenantId: String(organization.id),
    overrideAccess: false,
    req,
    user: req?.user,
  })
}

/**
 * **[CF-4] The calling convention for React Server Components.**
 *
 * An RSC has no `PayloadRequest` to pass, which the plan left unspecified — so this is the
 * documented answer rather than something each page invents. It reads the forwarded host
 * and the session from `next/headers` and authenticates through Payload, producing the same
 * scoped client a route handler gets.
 *
 * Only callable inside a Next request scope. Tests use `getTenantScopedPayload` with an
 * explicit `host` instead, which is why that escape hatch exists.
 *
 * @example
 *   // app/(frontend)/projects/page.tsx
 *   const db = await getTenantScopedPayloadForRSC()
 *   const { docs } = await db.find({ collection: 'tenantCanaries' })
 */
export async function getTenantScopedPayloadForRSC(
  options: ScopedPayloadOptions = {},
): Promise<TenantScopedPayload> {
  const { headers: nextHeaders } = await import('next/headers')
  const incoming = await nextHeaders()

  const host = options.host ?? incoming.get('x-tenant-host') ?? incoming.get('host') ?? null
  const organization = await resolveTenant(host ?? '', options.lookup)
  if (!organization) throw new TenantUnresolvedError(host)

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  const { user } = await payload.auth({ headers: incoming })

  return buildTenantClient({
    payload,
    tenantId: String(organization.id),
    overrideAccess: false,
    user,
  })
}
