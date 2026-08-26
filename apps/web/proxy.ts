import { NextResponse, type NextRequest } from 'next/server'

/**
 * Header hygiene only — no database, no Payload import (FR-011, SC-012).
 *
 * **Named `proxy.ts`, not `middleware.ts`.** Next 16 deprecated the `middleware` convention
 * in favour of `proxy` with a default export; spike S9 confirmed it, and Next's own request
 * log reports timing as `proxy.ts`. The runtime follows the convention too: `middleware.js`
 * ran on `edge`, `proxy.js` on `nodejs`.
 *
 * **Why resolution does not happen here**, even though `nodejs` could now hold a Postgres
 * connection: this runs on *every* request, and a per-request database round trip to answer
 * a question whose answer changes rarely is wrong regardless of runtime. Resolution is a
 * cached server-side lookup in `lib/tenancy/resolve.ts`, split behind a testable seam
 * because spike S8 showed `next/cache` cannot be exercised outside a request scope.
 *
 * **Why the headers go on the REQUEST, not the response** — spike S9 measured both:
 *   - `NextResponse.next({ request: { headers } })` reaches a Route Handler *and* an RSC.
 *   - A header set on the response also reaches the server, **and** reaches the client.
 * So the response is a leakier channel, not an inert one: putting tenant state there would
 * hand it to the browser for nothing.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

/** Header the app trusts for the forwarded host. Set here and nowhere else. */
export const TENANT_HOST_HEADER = 'x-tenant-host'

export default function proxy(req: NextRequest) {
  const headers = new Headers(req.headers)

  // Never trust an inbound tenant claim. A client that sends `x-tenant: other-org` must not
  // influence resolution — SC-012 asserts exactly this, and spike S9 confirmed the forged
  // value is gone by the time a Route Handler or RSC reads its headers.
  headers.delete('x-tenant')
  headers.delete(TENANT_HOST_HEADER)

  headers.set(TENANT_HOST_HEADER, req.headers.get('host') ?? '')

  return NextResponse.next({ request: { headers } })
}
