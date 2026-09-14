import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { REGRAS_XP_CITE } from '../../collections/content/RegrasXp'
import { resetWorld } from './fixtures'

/**
 * T013 / FR-009 — a **new** organization starts with the CITe economy, as its own data.
 *
 * FR-009 says `regrasXp` is per-organization data "seeded on organization creation from the
 * CITe default", so that retuning the economy is an edit and not a deploy. Two halves of that
 * sentence can each fail on their own, and both are asserted here:
 *
 *   - **Seeded.** `regrasXp.create` is a flat refusal for every role (see `regras-xp.test.ts`),
 *     so the row can only ever arrive from `SEED_ON_CREATE` through the system client. If the
 *     seed is not registered, a lab exists with no economy at all and every reader —
 *     `creditXp`, the projections, the lab level, the ranking — divides by `undefined`.
 *   - **Copied, never inherited.** `seed-on-create.ts`'s own docblock makes this the mechanism's
 *     reason for existing: a read-time fallback to a global default leaves every later reader
 *     asking "is this null, or inherited?". The second test retunes one lab and re-reads the
 *     other, which is the only way to tell a copy from a shared row.
 *
 * Driven against a real database rather than against the exported registry: `SEED_ON_CREATE`
 * holding one function proves a push happened, not that a row landed in the new organization —
 * and [N1] in `seed-on-create.ts` records that the tenant it lands in is exactly what a
 * request-scoped client would get wrong.
 */

type EconomyRow = {
  xpPorAcao: number
  xpPorNivel: number
  nivelMaximo: number
}

/** Every economy row belonging to one organization, read past access control. */
const economyOf = async (payload: Payload, organizationId: string | number) =>
  payload.find({
    collection: 'regrasXp',
    where: { tenant: { equals: organizationId } },
    depth: 0,
    overrideAccess: true,
  })

const newOrganization = async (payload: Payload, slug: string) =>
  payload.create({
    collection: 'organizations',
    data: { name: `Lab ${slug}`, slug, status: 'active' },
    overrideAccess: true,
  })

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
  await resetWorld(payload)
}, 120_000)

describe('regrasXp is seeded on organization creation (T013, FR-009)', () => {
  it('gives a brand-new organization exactly one economy row, at the CITe defaults', async () => {
    const org = await newOrganization(payload, 'seed-economy-cite')

    const economy = await economyOf(payload, org.id)

    expect(
      economy.totalDocs,
      'a new organization holds no regrasXp row: `regrasXp.create` refuses every role, so the ' +
        'row can only come from SEED_ON_CREATE — without it this lab has no economy at all and ' +
        'every level is floor(xp / undefined) = NaN',
    ).toBe(1)

    const row = economy.docs[0] as unknown as EconomyRow
    expect(
      { xpPorAcao: row.xpPorAcao, xpPorNivel: row.xpPorNivel, nivelMaximo: row.nivelMaximo },
      'the seeded economy disagrees with REGRAS_XP_CITE, so a new lab starts on numbers nobody ' +
        'decided (CLR-010: the CITe values are the seed, and this is where they are copied in)',
    ).toEqual(REGRAS_XP_CITE)
  })

  it('copies the economy per organization: retuning one lab leaves the other untouched', async () => {
    const tuned = await newOrganization(payload, 'seed-economy-tuned')
    const untouched = await newOrganization(payload, 'seed-economy-untouched')

    const tunedRow = (await economyOf(payload, tuned.id)).docs[0] as unknown as { id: string | number }
    expect(tunedRow, 'the retuned organization was never seeded, so there is nothing to retune').toBeDefined()

    await payload.update({
      collection: 'regrasXp',
      id: tunedRow.id,
      data: { xpPorNivel: 7 },
      overrideAccess: true,
    })

    const after = await economyOf(payload, untouched.id)
    const neighbour = after.docs[0] as unknown as EconomyRow

    expect(
      after.totalDocs,
      'the second organization holds a different number of economy rows than the first — the ' +
        'seed is not running once per organization',
    ).toBe(1)
    expect(
      neighbour.xpPorNivel,
      'retuning one lab moved another lab\'s curve: the economy is being shared rather than ' +
        'copied, which is exactly the inheritance seed-on-create.ts exists to refuse',
    ).toBe(REGRAS_XP_CITE.xpPorNivel)
  })
})
