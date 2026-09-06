import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TenantUnresolvedError } from '../../lib/tenancy/errors'
import {
  getPublicScopedPayload,
  getPublicScopedPayloadForRSC,
  readPublicOrganizationTheme,
} from '../../lib/tenancy/public-payload'
import { themeStyle } from '../../lib/theme'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T014 / FR-003 (001) — the anonymous theme read.
 *
 * Feature 001 delivered every downstream half of co-branding: the token layer declares
 * `--color-primary`, `themeStyle()` validates the stored colour, the layout publishes it on
 * `<body>`. None of it could ever fire, because `organizations.read` is `masterOnly()` and
 * the public site has no session: Payload's `executeAccess` throws `Forbidden` on a `false`
 * access result, so the read underneath all of it was refused. §1 measures that gate before
 * anything else, so a later "access was fine all along" reading of this file is refuted by
 * the file itself.
 *
 * It is the **same** defect as the public content path (plan § Research Notes: "one cause,
 * two symptoms"), which is why the fix is in `public-payload.ts` — the one module sanctioned
 * to run with `overrideAccess: true` for a caller with no user — rather than a second
 * widening of collection access that the multi-tenant plugin would AND away anyway.
 *
 * ── Why the host header is the only thing stubbed ──────────────────────────────────────
 *
 * `next/headers` throws outside a Next request scope (feature 000, spike S8), and it is the
 * layout's sole input. Everything below it — host resolution, the Payload client, access
 * control — runs for real against the fixture database, because a mocked Payload cannot tell
 * a read that access control permits from one it refuses, which is the entire subject here.
 */

const request = vi.hoisted(() => ({ host: 'org-a.localhost' }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}))

const ORG_A_ACCENT = '#3760AA'

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
  // Organization A is co-branded; B deliberately is not, so "B's host shows no colour" is
  // simultaneously the no-theme fallback and the proof that A's accent did not leak.
  await world.payload.update({
    collection: 'organizations',
    id: world.orgA.id,
    data: { theme: { primaryColor: ORG_A_ACCENT } },
    overrideAccess: true,
  })
  // The mocked header and the fixture must name the same organization, or §3 would assert
  // organization A's accent against whatever host happened to be hardcoded above.
  expect(request.host).toBe(world.orgA.host)
}, 120_000)

const themeOn = async (host: string) =>
  readPublicOrganizationTheme(await getPublicScopedPayload(host))

describe('§1 — the gate this task exists to get around is real', () => {
  it('refuses an anonymous read of the organization record through collection access', async () => {
    // `organizations.read = masterOnly()`. Reading with access control ON and no user is
    // exactly what an anonymous visitor's request is, and Payload throws rather than
    // returning zero rows. If this ever stops throwing, the fix below is no longer needed —
    // and this test is how anyone finds that out.
    await expect(
      world.payload.find({
        collection: 'organizations',
        where: { id: { equals: world.orgA.id } },
        overrideAccess: false,
      }),
      'an anonymous read of `organizations` succeeded through collection access. masterOnly() ' +
        'no longer gates it, which changes the premise of T014.',
    ).rejects.toThrow()
  })
})

describe('§2 — an anonymous visitor can read their own organization’s accent', () => {
  it('resolves the accent stored on the organization that owns the host', async () => {
    expect(
      themeStyle(await themeOn(world.orgA.host)),
      "the anonymous path could not read organization A's accent on organization A's own " +
        'host. Co-branding (FR-003) then never appears for a logged-out visitor, which is ' +
        'every visitor to the public site.',
    ).toEqual({ '--color-primary': ORG_A_ACCENT })
  })

  it('serves organization B its own record on B’s host — never A’s colour', async () => {
    expect(
      themeStyle(await themeOn(world.orgB.host)),
      'organization B, which stores no theme, was served a colour on its own host. Serving ' +
        "one lab's branding on another's hostname is the failure feature 000's US4 forbids.",
    ).toBeUndefined()
  })

  it('returns the theme and nothing else of the organization record', async () => {
    expect(
      Object.keys((await themeOn(world.orgA.host)) ?? {}),
      'the anonymous read handed back the whole `organizations` row. This path runs with ' +
        'overrideAccess: true for a caller with no user, so whatever it returns is public: ' +
        'the projection is what keeps a later private field (contact address, billing, ' +
        'invite secrets) from becoming readable by the mere act of being declared.',
    ).toEqual(['theme'])
  })

  it('throws TenantUnresolvedError for a host no organization claims', async () => {
    request.host = 'nowhere.example.com'
    try {
      await expect(
        getPublicScopedPayloadForRSC(),
        "an unclaimed host resolved to an organization. A silent fallback paints a stranger's " +
          "hostname with a real lab's identity; the layout turns this throw into a 404.",
      ).rejects.toBeInstanceOf(TenantUnresolvedError)
    } finally {
      request.host = world.orgA.host
    }
  })
})

describe('§3 — the public layout actually reads it', () => {
  const LAYOUT_SOURCE = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'layout.tsx')

  it('currentOrganization() resolves the accent with no session at all', async () => {
    // The whole chain for real: stubbed host header -> host resolution -> the anonymous
    // client -> access control -> Postgres. Nothing here is signed in, which is the point.
    const { currentOrganization } = await import('../../app/(frontend)/layout')

    expect(
      themeStyle(await currentOrganization()),
      'the layout resolved no accent for an anonymous visitor of organization A. Every ' +
        'downstream half of co-branding works and none of it fires: the read itself is what ' +
        '`organizations.read = masterOnly()` refuses.',
    ).toEqual({ '--color-primary': ORG_A_ACCENT })
  })

  it('does not reach the organization record through the session-scoped client', () => {
    expect(
      readFileSync(LAYOUT_SOURCE, 'utf8'),
      'the layout still reads `organizations` through getTenantScopedPayloadForRSC(). That ' +
        'client runs with overrideAccess: false and the visitor has no session, so the read ' +
        'is refused before it reaches the database — the defect T014 closes.',
    ).not.toMatch(/getTenantScopedPayloadForRSC/)
  })
})
