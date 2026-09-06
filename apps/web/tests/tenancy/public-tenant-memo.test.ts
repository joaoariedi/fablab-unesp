import { describe, expect, it } from 'vitest'

import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'
import type { HostLookup, HostResolution } from '../../lib/tenancy/resolve'

/**
 * The request-scoped memo on the public path (T011, FR-016).
 *
 * A public page resolves its host once per *request* in intent, and many times per request
 * in fact: every operation builds a client, and nested relationship population multiplies
 * that. `resolveTenant` has an `unstable_cache` in front of it, but feature 000 measured
 * that it **degrades when `next/cache` throws** — spike S8's `Invariant: incrementalCache
 * missing` — which is precisely the Local API path that tests, seeds and the Payload CLI
 * run on. React's `cache()` degrades on exactly the same path (measured: two calls outside
 * a server request return two different maps). So the memo has to hold where both of those
 * give up, and that is what this file asserts.
 *
 * The other half of the assertion is the one that keeps the memo *safe*: it must not become
 * a process-wide cache. `HostResolution.cacheable` exists because the sovereign fallback and
 * a miss may never be cached — caching `b.example.com -> org A` would serve org A's tenant
 * context on org B's subdomain for the cache's whole lifetime. A memo that outlived its
 * request would reintroduce that, so "resolves twice" is a required property below, not an
 * oversight.
 */

/**
 * Named fake: records every host it is asked about and answers with an organization derived
 * from that host, so a conflated memo shows up as the *wrong tenant*, not only as a count.
 *
 * The delay is load-bearing. Concurrent resolution is the fan-out the memo exists to
 * collapse, and a lookup that settles synchronously would never overlap with itself.
 */
class CountingHostLookup {
  readonly hosts: string[] = []

  readonly lookup: HostLookup = async (host: string): Promise<HostResolution> => {
    this.hosts.push(host)
    await new Promise((resolve) => setTimeout(resolve, 5))
    return {
      organization: { id: `org-for-${host}`, slug: host, name: host, status: 'active' },
      cacheable: false,
    }
  }
}

const HOST_A = 'org-a.memo.localhost'
const HOST_B = 'org-b.memo.localhost'

describe('request-scoped memo for resolveTenant (T011, FR-016)', () => {
  it('resolves the host once for a fan-out of concurrent clients', async () => {
    const resolver = new CountingHostLookup()

    const clients = await Promise.all([
      getPublicScopedPayload(HOST_A, { lookup: resolver.lookup }),
      getPublicScopedPayload(HOST_A, { lookup: resolver.lookup }),
      getPublicScopedPayload(HOST_A, { lookup: resolver.lookup }),
    ])

    expect(
      resolver.hosts.length,
      'every operation resolved the host again — the memo did not collapse the fan-out',
    ).toBe(1)
    for (const client of clients) {
      expect(client.tenantId, 'a memoized client came back on the wrong tenant')
        .toBe(`org-for-${HOST_A}`)
    }
  })

  it('keeps two hosts apart inside one fan-out', async () => {
    const resolver = new CountingHostLookup()

    const [onA, onB] = await Promise.all([
      getPublicScopedPayload(HOST_A, { lookup: resolver.lookup }),
      getPublicScopedPayload(HOST_B, { lookup: resolver.lookup }),
    ])

    expect(resolver.hosts.length, 'a second host was served from the first host\'s memo').toBe(2)
    expect(onA!.tenantId, 'host A was served host B\'s organization').toBe(`org-for-${HOST_A}`)
    expect(onB!.tenantId, 'host B was served host A\'s organization').toBe(`org-for-${HOST_B}`)
  })

  it('does not hold a settled resolution for the next caller (cacheable: false)', async () => {
    const resolver = new CountingHostLookup()

    await getPublicScopedPayload(HOST_A, { lookup: resolver.lookup })
    await getPublicScopedPayload(HOST_A, { lookup: resolver.lookup })

    expect(
      resolver.hosts.length,
      'the memo outlived its request — an uncacheable resolution became a process-wide cache',
    ).toBe(2)
  })

  it('never serves one lookup\'s answer to a caller that injected another', async () => {
    const production = new CountingHostLookup()
    const injected = new CountingHostLookup()

    await Promise.all([
      getPublicScopedPayload(HOST_A, { lookup: production.lookup }),
      getPublicScopedPayload(HOST_A, { lookup: injected.lookup }),
    ])

    expect(production.hosts.length, 'the memo is keyed on the host alone').toBe(1)
    expect(injected.hosts.length, 'an injected lookup was bypassed by a memo hit').toBe(1)
  })
})
