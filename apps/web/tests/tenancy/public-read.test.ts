import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PublicReadDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import { getPublicScopedPayload } from '../../lib/tenancy/public-payload'
import type { HostLookup } from '../../lib/tenancy/resolve'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The public-read harness: **four vantage points** (T012, SC-002, FR-010).
 *
 * Written before any content collection exists, deliberately. The subject is the anonymous
 * read path itself — `getPublicScopedPayload` — not the documents it will one day serve, and
 * the whole point of writing it now is that the twelve collections of 002b arrive against a
 * gate rather than in front of one.
 *
 * ## The four vantage points, and why these four
 *
 *   1. **anonymous** — no session at all. The obvious case.
 *   2. **member of this organization** — signed in, belongs to the host's lab.
 *   3. **member of another organization** — signed in, belongs to a *different* lab.
 *   4. **signed-in with no membership** — authenticated, belongs to nothing.
 *
 * The last two are what review round 1 **measured** as broken, and they are the reason the
 * public path is a client rather than an access function:
 *
 *   - The multi-tenant plugin AND-s `{ tenant: { in: userTenantIDs } }` onto whatever
 *     collection access returns whenever `req.user` exists and is not a master
 *     (`withTenantAccess.js`). For vantage 3 that reduces any "public" branch to
 *     `tenant IN [their own lab]` — so the host's published content becomes invisible to the
 *     one visitor most likely to be looking at it.
 *   - For vantage 4 the same wrapper returns `false` outright, before our access function is
 *     consulted at all. A freshly registered account — feature 004's entire output — would
 *     therefore see **less than a logged-out visitor**.
 *
 * So the property under test is not "anonymous visitors can read". It is that **the public
 * answer does not depend on the session**: all four vantage points get exactly the rows a
 * logged-out visitor gets, confined to the host's organization.
 *
 * The second `describe` asserts the inverse, and it is the half with teeth: collection access
 * must **never** serve an anonymous reader. Any future attempt to solve public reads by
 * widening `scopedAccess()` — the round-1 design — turns that assertion red rather than
 * shipping a leak.
 */

/** The only scoped collection that exists before 002b. `projeto` joins it at T024/T035. */
const COLLECTION = 'tenantCanaries'

/** Matches `fixtures.ts`; the fourth vantage point needs a user the shared world has no use for. */
const PASSWORD = 'fixture-password-123'

type Row = { id: string | number; tenant?: unknown }

let world: Fixture
let noMembership: Record<string, unknown>

beforeAll(async () => {
  world = await buildWorld()

  // `master` also carries `orgs: []`, but it reads across every organization — it proves the
  // opposite thing. Vantage 4 is an ordinary user who simply belongs to nothing yet.
  const created = await world.payload.create({
    collection: 'users',
    data: { email: 'nobody@example.com', password: PASSWORD, role: 'user', orgs: [] },
    overrideAccess: true,
  })
  noMembership = { ...created, collection: 'users' }
}, 120_000)

afterEach(() => {
  vi.restoreAllMocks()
})

const VANTAGES = [
  'anonymous',
  'member of this organization',
  'member of another organization',
  'signed-in with no membership',
] as const

type Vantage = (typeof VANTAGES)[number]

const sessionOf = (vantage: Vantage): Record<string, unknown> | null => {
  if (vantage === 'member of this organization') return world.userA
  if (vantage === 'member of another organization') return world.userB
  if (vantage === 'signed-in with no membership') return noMembership
  return null
}

const tenantIdOf = (row: Row): string => {
  const ref = row.tenant
  return String(ref && typeof ref === 'object' && 'id' in ref ? (ref as { id: unknown }).id : ref)
}

/**
 * The public surface, read as this vantage point.
 *
 * The session is resolved and checked here and then deliberately **not** handed to
 * `getPublicScopedPayload`: it takes a host and nothing else, which is the mechanism by which
 * vantages 3 and 4 stop being special cases. The `expect` is what keeps that from making this
 * harness four copies of the anonymous case — a fixture that quietly produced `null` for the
 * signed-in vantages would otherwise prove nothing three times over.
 */
const publicClientAs = async (vantage: Vantage, host: string) => {
  const session = sessionOf(vantage)
  expect(
    session === null,
    `the "${vantage}" vantage point carried no session — the harness would be testing the ` +
      `anonymous case a second time under a different name`,
  ).toBe(vantage === 'anonymous')

  return getPublicScopedPayload(host)
}

/**
 * The same read through **collection access** instead — what the round-1 design proposed.
 *
 * A refusal and an empty page are the same answer for SC-002's purposes, so `false` from
 * `scopedAccess()` (which Payload raises as Forbidden) is normalised to zero rows rather than
 * failing the test for the wrong reason.
 */
const accessRead = async (vantage: Vantage, collection = COLLECTION): Promise<Row[]> => {
  const session = sessionOf(vantage)
  try {
    const result = await world.payload.find({
      collection: collection as never,
      depth: 0,
      limit: 100,
      overrideAccess: false,
      ...(session ? { user: session as never } : {}),
    })
    return result.docs as Row[]
  } catch {
    return []
  }
}

/** Named fake: resolves every host to the given organization, without touching the database. */
const stubHostLookup = (orgId: string): HostLookup => async () => ({
  organization: { id: orgId, slug: 'org-a', name: 'Organização A', status: 'active' },
  cacheable: false,
})

/**
 * ## Why this block reads `organizations` rather than the canary
 *
 * It used to read `tenantCanaries` and assert rows came back. That could only ever pass
 * because the client served a collection it could not filter — `tenantCanaries` declares no
 * `status`, so no published-only filter exists for it, and the old rule responded by applying
 * *none*. The harness was therefore green **on the leak**: the same code path served
 * `pendingInvites`, invite e-mails included, to anyone with no session.
 *
 * The client now refuses what it cannot constrain, so lending the canary a publishable
 * declaration does not rescue the old shape either — Payload rejects the query outright
 * ("The following path cannot be queried: status"), because the field genuinely is not there.
 *
 * So the row-level half of SC-002 is asserted against the one public read that is real today:
 * the organization record behind feature 001's accent colour. It is the only production caller
 * of this module, it is confined by the id the *host* resolved to, and — the property this
 * block exists for — it must answer identically from all four vantage points. The same
 * assertions over content collections arrive with `projeto` (T024/T035), which is the first
 * scoped collection that will actually carry `status`.
 */
describe('the public answer does not depend on the session (SC-002)', () => {
  for (const vantage of VANTAGES) {
    it(`serves the host organization's own record to a visitor who is ${vantage}`, async () => {
      const db = await publicClientAs(vantage, world.orgA.host)
      const record = await db.findByID<{ id: unknown }>({
        collection: 'organizations',
        id: db.tenantId,
      })

      expect(
        record,
        `a visitor who is ${vantage} received nothing on organization A's host`,
      ).not.toBeNull()
      expect(
        String(record?.id),
        `a visitor who is ${vantage} was served another organization's record`,
      ).toBe(world.orgA.id)
    })

    it(`refuses an unresolvable host for a visitor who is ${vantage}`, async () => {
      sessionOf(vantage)
      await expect(getPublicScopedPayload('nowhere.example.com')).rejects.toBeInstanceOf(
        TenantUnresolvedError,
      )
    })

    it(`cannot reach organization B by id as ${vantage}`, async () => {
      // Refused rather than answered "not found": the exemption is *the tenant the host
      // resolved to*, so an id the caller chose never reaches a query at all. That is a
      // stronger answer than null, and it is the one the allow-list gives.
      const db = await publicClientAs(vantage, world.orgA.host)
      await expect(
        db.findByID({ collection: 'organizations', id: world.orgB.id }),
        `a visitor who is ${vantage} reached a record belonging to organization B`,
      ).rejects.toBeInstanceOf(PublicReadDeniedError)
    })

    it(`is refused a collection that cannot be filtered, as ${vantage}`, async () => {
      // Fail-closed parity. The refusal must not depend on the session either: a rule that
      // denied anonymous visitors and served signed-in ones would be the round-1 bug wearing
      // the opposite mask.
      const db = await publicClientAs(vantage, world.orgA.host)
      await expect(
        db.find({ collection: COLLECTION, limit: 100 }),
        `a visitor who is ${vantage} was served a collection with no published-only filter`,
      ).rejects.toBeInstanceOf(PublicReadDeniedError)
    })
  }

  it('gives every vantage point exactly the answer a logged-out visitor gets', async () => {
    const answerFor = async (vantage: Vantage): Promise<string> => {
      const db = await publicClientAs(vantage, world.orgA.host)
      const own = await db.findByID<{ id: unknown }>({
        collection: 'organizations',
        id: db.tenantId,
      })
      const foreign = await db
        .findByID({ collection: 'organizations', id: world.orgB.id })
        .then(() => 'served')
        .catch((err: unknown) => (err instanceof PublicReadDeniedError ? 'refused' : 'other'))
      const refused = await db
        .find({ collection: COLLECTION })
        .then(() => 'served')
        .catch((err: unknown) => (err instanceof PublicReadDeniedError ? 'refused' : 'other'))
      return JSON.stringify({ own: String(own?.id), foreign, refused })
    }

    const loggedOut = await answerFor('anonymous')
    for (const vantage of VANTAGES) {
      expect(
        await answerFor(vantage),
        `a visitor who is ${vantage} got a different answer than a logged-out visitor — ` +
          `the public read consulted the session`,
      ).toBe(loggedOut)
    }
  })
})

describe('collection access is not the public read path, and must not become it', () => {
  it('serves an anonymous reader nothing at all through collection access', async () => {
    // The round-1 design put a public branch in `scopedAccess()`. If anyone tries it again,
    // this is the assertion that goes red — before the leak ships rather than after.
    expect(
      await accessRead('anonymous'),
      'collection access served rows to an anonymous reader',
    ).toHaveLength(0)
  })

  it('still serves a member of the organization through collection access', async () => {
    // Non-vacuity: without this, every assertion in this block would also pass against a
    // collection nobody can read at all, or an empty database.
    expect(
      await accessRead('member of this organization'),
      'the access path returned nothing even for its own member — the surrounding ' +
        'zero-row assertions would prove nothing',
    ).not.toHaveLength(0)
  })

  it('hides this host\'s rows from a member of another organization (round 1)', async () => {
    const docs = await accessRead('member of another organization')
    const fromHostOrg = docs.filter((row) => tenantIdOf(row) === world.orgA.id)
    expect(
      fromHostOrg,
      'collection access served organization A\'s rows to a member of organization B',
    ).toHaveLength(0)
  })

  it('serves a signed-in user with no membership nothing at all (round 1)', async () => {
    // Measured: the plugin's wrapper refuses this user before our access function runs, so
    // through access alone they see *less* than a logged-out visitor. The first `describe`
    // is what proves the public path repairs that.
    expect(
      await accessRead('signed-in with no membership'),
      'the no-membership vantage point read rows through collection access',
    ).toHaveLength(0)
  })
})

describe('the published-only filter survives a session (FR-010)', () => {
  /**
   * No scoped collection carries `status` until `projeto` (T024), so the publishable set is
   * injected through the seam the module exposes for exactly this, and the assertion is made
   * on the query that reached Payload. Asserted per vantage point because "drafts leak to
   * signed-in visitors only" is precisely the shape of bug this harness exists to catch.
   */
  for (const vantage of VANTAGES) {
    it(`filters to publicado, and keeps the tenant clause, for ${vantage}`, async () => {
      sessionOf(vantage)
      const spy = vi.spyOn(world.payload, 'find').mockResolvedValue({
        docs: [],
        totalDocs: 0,
      } as never)

      const db = await getPublicScopedPayload(world.orgA.host, {
        publishable: new Set([COLLECTION]),
        lookup: stubHostLookup(world.orgA.id),
      })
      await db.find({ collection: COLLECTION })

      const where = JSON.stringify(spy.mock.calls.at(-1)?.[0]?.where ?? {})
      expect(where, `unpublished rows were served to ${vantage}`).toContain('publicado')
      expect(where, `the tenant constraint was dropped for ${vantage}`).toContain(world.orgA.id)
    })
  }
})

/**
 * ## T035 — the same three answers, demanded of real content (SC-002, FR-010)
 *
 * Everything above was written before a content collection existed, so its row-level half had
 * to be asserted against `organizations` — the one public read that was real at the time — and
 * its published-only half against an injected `publishable` set. Both were proxies, and both
 * say so in their own docstrings.
 *
 * `projeto` (T024) is the first scoped collection that actually carries `status`, so the three
 * answers the task names can now be demanded of the thing itself, with **nothing injected**:
 * the publishable set is derived from the real config, the host is resolved by the real
 * resolver, and the rows are real rows.
 *
 *   - a **published** project on its own host is served;
 *   - an **unpublished** one — `rascunho` and `em_revisao`, the two review states — is not
 *     found, which is the 404 a page renders from `null`;
 *   - **another organization's**, published or not, is not found either.
 *
 * The published case is asserted from all four vantage points for the reason the first block
 * exists: "drafts are hidden from logged-out visitors and served to signed-in ones" and "the
 * host's own content is invisible to a visitor who belongs to another lab" are both bugs that
 * only a per-vantage assertion catches, and both were measured in round 1.
 */
describe('a published project reads publicly, an unpublished one does not (T035)', () => {
  /** Both organizations publish under this slug, so a cross-tenant hit cannot pass as luck. */
  const SHARED_SLUG = 't035-mesmo-slug'

  type Marker = 'A' | 'B'

  /**
   * A project needs a category from its **own** organization or `sameTenant` refuses the
   * create (T026), so the id comes from the seeded world rather than a literal. The throw
   * names the missing collection: without it a registry rename would surface here as
   * "cannot read property A of undefined" from inside Payload, two layers from the cause.
   */
  const categoriaOf = (marker: Marker): string | number => {
    const ids = world.rows.categoriaProjeto
    if (!ids) {
      throw new Error(
        'fixtures seeded no `categoriaProjeto` row — the T035 block cannot create a project ' +
          'without a category from the same tenant',
      )
    }
    return ids[marker]
  }

  const seedProject = async (
    marker: Marker,
    slug: string,
    status: 'rascunho' | 'em_revisao' | 'publicado',
  ): Promise<string> => {
    const org = marker === 'A' ? world.orgA : world.orgB
    const created = await world.payload.create({
      collection: 'projeto',
      // `overrideAccess: true` for the same reason `fixtures.ts` gives: building the world is
      // not the subject. It also side-steps `canPublishField`, which is T033's subject and
      // would otherwise make this block fail for someone else's reason.
      overrideAccess: true,
      data: {
        titulo: `Projeto ${slug} (${marker})`,
        slug,
        descricaoCurta: `Conteúdo de ${marker} para o T035.`,
        // The media row the fixture seeded for THIS organization. A bare key stopped being
        // valid when `imagemCapa` became a relationship (decision D3 revised) — and
        // `sameTenant` would refuse a media document belonging to the other lab.
        imagemCapa: world.rows.midiaImagem?.[marker],
        categoria: categoriaOf(marker),
        tenant: org.id,
        downloads: 0,
        curtidas: 0,
        status,
      } as never,
    })
    return String((created as { id: string | number }).id)
  }

  let publishedA: string
  let inReviewA: string
  let draftA: string
  let publishedB: string

  beforeAll(async () => {
    publishedA = await seedProject('A', SHARED_SLUG, 'publicado')
    inReviewA = await seedProject('A', 't035-em-revisao', 'em_revisao')
    draftA = await seedProject('A', 't035-rascunho', 'rascunho')
    publishedB = await seedProject('B', SHARED_SLUG, 'publicado')
  }, 60_000)

  for (const vantage of VANTAGES) {
    it(`serves organization A's published project to a visitor who is ${vantage}`, async () => {
      const db = await publicClientAs(vantage, world.orgA.host)
      const doc = await db.findByID<{ id: unknown; status?: unknown }>({
        collection: 'projeto',
        id: publishedA,
      })

      expect(
        String(doc?.id),
        `a visitor who is ${vantage} was not served a published project on its own host`,
      ).toBe(publishedA)
      expect(doc?.status).toBe('publicado')
    })

    it(`does not find an unpublished project as ${vantage}`, async () => {
      const db = await publicClientAs(vantage, world.orgA.host)
      for (const [state, id] of [
        ['em_revisao', inReviewA],
        ['rascunho', draftA],
      ] as const) {
        expect(
          await db.findByID({ collection: 'projeto', id }),
          `a visitor who is ${vantage} read a project still in ${state} — FR-010 says only ` +
            `publicado is public, and a page would have rendered it instead of a 404`,
        ).toBeNull()
      }
    })

    it(`does not find organization B's published project on A's host as ${vantage}`, async () => {
      const db = await publicClientAs(vantage, world.orgA.host)
      expect(
        await db.findByID({ collection: 'projeto', id: publishedB }),
        `a visitor who is ${vantage} reached organization B's project through A's host`,
      ).toBeNull()
    })
  }

  it('lists only the host organization, and only what it published', async () => {
    const db = await getPublicScopedPayload(world.orgA.host)
    const { docs } = await db.find<{ id: unknown; tenant?: unknown; status?: unknown }>({
      collection: 'projeto',
      limit: 100,
    })

    expect(docs.map((row) => String(row.id)), 'the published project was missing from the listing')
      .toContain(publishedA)
    expect(
      docs.filter((row) => row.status !== 'publicado'),
      'the public listing carried a row that is not publicado',
    ).toHaveLength(0)
    expect(
      docs.filter((row) => tenantIdOf(row as Row) !== world.orgA.id),
      "the public listing carried another organization's rows",
    ).toHaveLength(0)
  })

  it('serves each host its own project when both published the same slug', async () => {
    const bySlug = async (host: string): Promise<string[]> => {
      const db = await getPublicScopedPayload(host)
      const { docs } = await db.find<{ id: unknown }>({
        collection: 'projeto',
        where: { slug: { equals: SHARED_SLUG } },
        limit: 100,
      })
      return docs.map((row) => String(row.id))
    }

    // The slug is the public URL (`/projetos/{slug}`), and it is unique per organization
    // rather than per platform — so the read that resolves it is the one most likely to serve
    // the wrong lab's row, and the one worth pinning.
    expect(await bySlug(world.orgA.host)).toEqual([publishedA])
    expect(await bySlug(world.orgB.host)).toEqual([publishedB])
  })

  it('cannot be widened by a where the caller supplies', async () => {
    const db = await getPublicScopedPayload(world.orgA.host)
    const { docs } = await db.find<{ id: unknown }>({
      collection: 'projeto',
      // Asking for exactly what the filter hides. It is AND-ed, never replaced, so this is a
      // contradiction rather than an override — the property `buildTenantClient` documents,
      // asserted here against the status filter the public client adds on top of it.
      where: { status: { equals: 'rascunho' } },
      limit: 100,
    })
    expect(docs, 'a caller-supplied where widened the public read back onto drafts').toHaveLength(0)
  })

  it('serves the same published project through collection access to nobody anonymous', async () => {
    // The public answer above must not have arrived by widening `scopedAccess()`. Same
    // assertion as the canary block makes, now on the collection that actually has content.
    expect(
      await accessRead('anonymous', 'projeto'),
      'collection access served projects to an anonymous reader — the public read path is ' +
        'the client, and access must stay closed',
    ).toHaveLength(0)
  })
})

/**
 * ## T005 — the four doors `publicList` opened, and the walls that stayed up (SC-003, SC-007)
 *
 * T004 gave `categoriaProjeto`, `categoriaArtigo`, `categoriaModelo` and `maquina` a
 * `publicList` reason, which is the **second** way past `assertPubliclyReadable` and the first
 * one that is not "this row is published". Every previous assertion in this file was written
 * against a gate with one door; this block is the one that says the second door did not become
 * a corridor.
 *
 * The four collections asserted here are the ones a mistaken generalisation would take with it:
 *
 *   - `midiaImagem` — **scoped, no `status`**, exactly like a category. The distinction is not a
 *     property of the row, it is the sentence somebody wrote: a category is *enumerated* by the
 *     tabs, a cover image is *populated* behind a project the published-only filter already
 *     cleared. "Has no status" would admit both, and it would hand out every file the lab ever
 *     uploaded — the ones attached to drafts included.
 *   - `perfilMaker` — the public maker profile is a future spec (spec § Scope), so nothing may
 *     list it yet; a listing is every maker's handle and the account behind it.
 *   - `curtida` — a like row names the **person**, not the count. FR-015 shows a count; it never
 *     shows who.
 *   - `users` — `global`, so `buildTenantClient` puts no tenant clause on it at all. A
 *     `publicList` reason could not confine it even if somebody wrote one, which is why the
 *     refusal message for it says something different from the other three.
 *
 * And the positive half, which is what stops the block above from being satisfiable by a client
 * that refuses everything: a card still gets its category chip and its cover image, because
 * `depth: 1` populates them **through** a published `projeto`. That path is the reason
 * `midiaImagem` needs no declaration — and if it ever stopped working, the pressure to give it
 * one would be immediate.
 */
describe('publicList opened four doors and nothing else (T005)', () => {
  /**
   * `users` is `global` and therefore absent from `world.rows`, which only carries scoped
   * collections. Its id comes from the seeded member instead — the point is that the refusal
   * happens for a row that genuinely exists.
   */
  const idOfRefused = (collection: string): string | number => {
    if (collection === 'users') return (world.userA as { id: string | number }).id
    const ids = world.rows[collection]
    if (!ids) {
      throw new Error(
        `fixtures seeded no "${collection}" row, so its refusal would be indistinguishable ` +
          `from "no such document" — the T005 negative needs a real id to be refused`,
      )
    }
    return ids.A
  }

  /** Refused collection → the half of the gate's message that must name its reason. */
  const REFUSED = [
    ['midiaImagem', 'declares no `status`'],
    ['perfilMaker', 'declares no `status`'],
    ['curtida', 'declares no `status`'],
    ['users', 'it is `global`'],
  ] as const

  for (const [collection, reason] of REFUSED) {
    for (const vantage of VANTAGES) {
      it(`refuses ${collection} to a visitor who is ${vantage}`, async () => {
        const db = await publicClientAs(vantage, world.orgA.host)

        await expect(
          db.find({ collection, limit: 100 }),
          `a visitor who is ${vantage} listed ${collection} — no page enumerates it, so the ` +
            `only way it became readable is a publicList reason nobody should have written`,
        ).rejects.toBeInstanceOf(PublicReadDeniedError)

        // The id half too: `findByID` builds its own `where`, so a widening there would not
        // show up in the `find` assertion above. The id is the row the fixture seeded, so a
        // refusal cannot be mistaken for "no such document".
        await expect(
          db.findByID({ collection, id: idOfRefused(collection) }),
          `a visitor who is ${vantage} read a ${collection} row by id`,
        ).rejects.toBeInstanceOf(PublicReadDeniedError)

        await expect(db.find({ collection })).rejects.toThrow(reason)
      })
    }
  }

  const SLUG = 't005-populado'
  let projectId: string
  let categoriaId: string
  let categoriaNome: string
  let capaId: string

  beforeAll(async () => {
    const ids = world.rows.categoriaProjeto
    const media = world.rows.midiaImagem
    if (!ids || !media) {
      throw new Error(
        'fixtures seeded no `categoriaProjeto` or `midiaImagem` row — the T005 population ' +
          'assertion has nothing to populate through',
      )
    }
    categoriaId = String(ids.A)
    capaId = String(media.A)

    const categoria = await world.payload.findByID({
      collection: 'categoriaProjeto',
      id: ids.A,
      overrideAccess: true,
    })
    // Through `unknown`: without the generated `payload-types.ts` — which is gitignored, so CI
    // never has it — Payload types this as `JsonObject & TypeWithID`, which does not overlap
    // with the shape asserted here and makes the direct cast a compile error in the pipeline
    // while passing locally.
    categoriaNome = String((categoria as unknown as { nome: unknown }).nome)

    const created = await world.payload.create({
      collection: 'projeto',
      // Same reason `fixtures.ts` gives: building the world is not the subject, and
      // `canPublishField` (T033) would otherwise fail this block for someone else's reason.
      overrideAccess: true,
      data: {
        titulo: 'Projeto populado (T005)',
        slug: SLUG,
        descricaoCurta: 'O card precisa da categoria e da capa junto com a linha.',
        imagemCapa: media.A,
        categoria: ids.A,
        tenant: world.orgA.id,
        downloads: 0,
        curtidas: 0,
        status: 'publicado',
      } as never,
    })
    projectId = String((created as { id: string | number }).id)
  }, 60_000)

  /** The populated shape: an object carrying its own fields, not the id Payload started from. */
  type Populated = { id: unknown; nome?: unknown }
  type CardRow = { id: unknown; categoria?: unknown; imagemCapa?: unknown }

  const populated = (value: unknown, field: string): Populated => {
    expect(
      value !== null && typeof value === 'object',
      `\`${field}\` came back as ${JSON.stringify(value)} rather than a populated document — ` +
        `a card cannot render a chip or a cover from an id`,
    ).toBe(true)
    return value as Populated
  }

  it('populates the category through a published projeto at depth 1', async () => {
    const db = await getPublicScopedPayload(world.orgA.host)
    const doc = await db.findByID<CardRow>({ collection: 'projeto', id: projectId, depth: 1 })

    const categoria = populated(doc?.categoria, 'categoria')
    expect(String(categoria.id)).toBe(categoriaId)
    // `nome` exists only on the populated row — it is what the chip prints, and asserting it
    // is what stops `{ id }` echoed back from passing as population.
    expect(categoria.nome, 'the populated category carried no `nome` for the chip to print').toBe(
      categoriaNome,
    )
  })

  it('populates the cover image it refuses to list, at depth 1', async () => {
    // The whole justification for `midiaImagem` having no `publicList` reason: the card gets
    // its cover *through* a document the published-only filter already cleared. If this ever
    // goes red, the refusal above stops being a decision and becomes a missing feature.
    const db = await getPublicScopedPayload(world.orgA.host)
    const doc = await db.findByID<CardRow>({ collection: 'projeto', id: projectId, depth: 1 })

    expect(String(populated(doc?.imagemCapa, 'imagemCapa').id)).toBe(capaId)
  })

  it('populates the same two fields through the listing, not only by id', async () => {
    // The grid is a `find`, and it builds its `where` separately from `findByID` — so the
    // listing has to be asserted rather than inferred from the detail read.
    const db = await getPublicScopedPayload(world.orgA.host)
    const { docs } = await db.find<CardRow>({
      collection: 'projeto',
      where: { slug: { equals: SLUG } },
      depth: 1,
      limit: 100,
    })

    expect(docs.map((row) => String(row.id))).toEqual([projectId])
    expect(String(populated(docs[0]?.categoria, 'categoria').id)).toBe(categoriaId)
    expect(String(populated(docs[0]?.imagemCapa, 'imagemCapa').id)).toBe(capaId)
  })

  it('leaves both fields unpopulated at depth 0', async () => {
    // Non-vacuity for the three assertions above: without this they would also pass against a
    // client that populated everything regardless of `depth`, and the depth the page asks for
    // would be decoration rather than the thing being tested.
    const db = await getPublicScopedPayload(world.orgA.host)
    const doc = await db.findByID<CardRow>({ collection: 'projeto', id: projectId, depth: 0 })

    expect(typeof doc?.categoria, '`categoria` was populated at depth 0').not.toBe('object')
    expect(typeof doc?.imagemCapa, '`imagemCapa` was populated at depth 0').not.toBe('object')
  })
})
