import { beforeAll, describe, expect, it } from 'vitest'

import { PublicReadDeniedError } from '../../lib/tenancy/errors'
import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'
import { SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T006 / FR-003, FR-027, CLR-001 — the one door a `global` collection has on the anonymous path.
 *
 * ## Why this file exists at all
 *
 * `getPublicScopedPayload` refuses `global` collections **by construction**, and the reason is
 * written into `isPubliclyListable`: a `publicList` sentence cannot manufacture the `tenant`
 * column that confines an enumeration to this host, so admitting a global collection on the
 * strength of its own declaration would serve every organization's rows. That argument is right,
 * and it made step 1 of `/criar-conta` unreachable: the avatar catalogue is `global` by CLR-001,
 * the builder is shown to somebody with no account (FR-003), and the gate threw for it. The plan
 * said the builder *"reads the catalogue through the choke point"*; as shipped, that call raised.
 *
 * Found in this feature's own verification round rather than by the plan, which is why the fix
 * is a narrow allow-list with its reasoning beside it instead of a widened predicate.
 *
 * ## What makes these three admissible where `users` is not
 *
 * The leak the `isScoped` guard exists to stop is *serving every organization's rows*. These
 * tables have no organization's rows to serve — they are product-shipped reference data,
 * identical for every lab, which is exactly why CLR-001 made them global rather than letting
 * each lab name its own cosmetics. "Unconstrained by tenant" and "leaks across tenants" are the
 * same sentence for `users` and different sentences for a table where every row belongs to the
 * product.
 *
 * So the assertions below come in pairs, and the second of each pair is the one with teeth:
 * the door opens for the catalogue, **and stays shut for every other global collection**. A
 * future edit that widened the predicate instead of extending the list would pass the first
 * half of every pair and fail the second.
 */

/** The three the allow-list admits — named here, not imported, so a widened list shows up as a
 *  failure rather than being ratified by a constant that moved with it. */
const CATALOGO = ['tomDePele', 'tomDeCabelo', 'avatarItem'] as const

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

describe('the avatar catalogue is listable with no account (FR-003, CLR-001)', () => {
  it.each(CATALOGO)('serves %s to an anonymous visitor', async (collection) => {
    const db = await getPublicScopedPayload(world.orgA.host)

    // The claim is that the gate ANSWERS — a rejection here is the state that made the builder
    // unbuildable. The row count is deliberately not asserted: seeding the catalogue is T008's,
    // and a gate that only works once rows exist is a gate with a hidden precondition.
    await expect(
      db.find({ collection, limit: 100 }),
      `the choke point refused ${collection}, so the avatar builder at step 1 of /criar-conta ` +
        'has no way to read its own catalogue — the visitor it exists for has no account, and ' +
        'every other read path requires one',
    ).resolves.toBeDefined()
  })

  it('is genuinely global — the half of the guard that stops the door widening', () => {
    for (const collection of CATALOGO) {
      // `isPublicGlobalCatalogue` AND-s in `!isScoped`. If one of these were ever redeclared
      // scoped, the allow-list would admit it while skipping the published-only filter
      // `PUBLISHABLE` would have built — a scoped collection served unfiltered, which is the
      // 002 leak shape exactly. Then the entry belongs in `publicList`, not here.
      expect(
        SCOPE_REGISTRY[collection]?.scope,
        `${collection} is in the anonymous catalogue allow-list but is no longer global. The ` +
          'allow-list skips the tenant and status filters because a product-wide table needs ' +
          'neither; a scoped collection needs both.',
      ).toBe('global')
    }
  })
})

describe('every other global collection is still refused (SC-002)', () => {
  /** The globals that are NOT the catalogue: identity, and the tenant itself. */
  const OUTROS_GLOBAIS = Object.entries(SCOPE_REGISTRY)
    .filter(([slug, entry]) => entry.scope === 'global' && !CATALOGO.includes(slug as never))
    .map(([slug]) => slug)

  it('finds some to test — an empty list would make the cases below vacuous', () => {
    expect(OUTROS_GLOBAIS).toContain('users')
    expect(OUTROS_GLOBAIS).toContain('organizations')
  })

  it.each(OUTROS_GLOBAIS)('refuses %s through find, as it did before the door opened', async (
    collection,
  ) => {
    const db = await getPublicScopedPayload(world.orgA.host)

    await expect(
      db.find({ collection, limit: 100 }),
      `${collection} is global, so it gets no tenant constraint — serving it anonymously hands ` +
        'out every row on the platform. `users` is the measured case: the rejected first ' +
        'version of this gate would have served every account.',
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })
})
