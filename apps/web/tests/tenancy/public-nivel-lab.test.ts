import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REGRAS_XP_CITE } from '../../collections/content/RegrasXp'
import { nivelDoLab } from '../../lib/content/xp'
import { PublicReadDeniedError, TenantUnresolvedError } from '../../lib/tenancy/errors'
import {
  CAMPOS_DA_SOMA,
  getPublicLabLevelStore,
  getPublicLabLevelStoreForRSC,
} from '../../lib/tenancy/public-payload'
import { buildWorld, type Fixture } from './fixtures'

/**
 * T023 / FR-016, CLR-001 — **`getPublicLabLevelStore`**, the sixth named exemption in
 * `lib/tenancy` and the narrowest of them.
 *
 * ── What was wrong, and why no existing test saw it ─────────────────────────────────────────
 *
 * Phase 4 shipped the NÍVEL DO LAB card reading through `getTenantScopedPayloadForRSC`, which is
 * `overrideAccess: false` with the session user, and `scopedAccess()` opens with
 * `if (!user) return false`. Every signed-out visitor therefore got *"Não foi possível
 * carregar"* on a card FR-016 and CLR-001 both call public. All six of the card's tests injected
 * a store that answers, so the card drew its level whichever door the page had opened — the
 * defect lived in the door, and nothing in that file was looking at the door.
 *
 * ── Why the answer is a store and not a `readPublicX` ───────────────────────────────────────
 *
 * The ranking's answer does not transfer. `readPublicRanking` is safe because `perfilMaker` rows
 * project to five harmless columns; this card needs a **sum over `xpLedger`**, whose entries are
 * *who earned what, for which action, when* — the lab's whole activity history. A `publicList`
 * declaration would serve those rows collection-wide and unfiltered to every anonymous page
 * read, which is more than the ranking discloses and more than spec.md authorises.
 *
 * So the bound is the store: two collections, a **forced** projection, and no `where`. This file
 * measures all three against a real Postgres, because the distinction that matters — a column
 * never fetched versus a column fetched and dropped afterwards — is one a fake cannot make.
 *
 * ── The fixture ─────────────────────────────────────────────────────────────────────────────
 *
 * `buildWorld` seeds one ledger entry of `xpPorAcao` per organization. Each side gets one more,
 * **anonymised** (`perfil: null`, CLR-011's tombstone), for two reasons: it is the case
 * `nivelDoLab` documents as load-bearing — *"every entry counts, including the ones that name
 * nobody"* — and an entry belonging to no profile drifts no derived column, so
 * `tests/content/counters.test.ts`, which reconciles the whole database, stays green.
 *
 * The two sides are given DIFFERENT totals on purpose: a dropped tenant clause would answer with
 * the sum of both, and both a level and an `atual` that no lab has.
 */

const request = vi.hoisted(() => ({ host: '' }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}))

/** The anonymised top-up per side. A's crosses two level boundaries; B's is far larger, so a
 *  leak between them is loud rather than a rounding difference. */
const EXTRA_A = 11
const EXTRA_B = 40

/** What A's ledger sums to: the seeded entry plus the anonymised one. */
const XP_DE_A = REGRAS_XP_CITE.xpPorAcao + EXTRA_A
const NIVEL_DE_A = Math.floor(XP_DE_A / REGRAS_XP_CITE.xpPorNivel)
const ATUAL_DE_A = XP_DE_A % REGRAS_XP_CITE.xpPorNivel

/** Every column an `xpLedger` row carries beyond `quantidade` — together, the activity log this
 *  store exists to keep off the anonymous path. */
const COLUNAS_DA_ATIVIDADE = [
  'perfil',
  'skill',
  'acao',
  'refTipo',
  'refId',
  'chaveIdempotencia',
  'createdAt',
  'updatedAt',
  'tenant',
] as const

let world: Fixture
/**
 * Captured rather than thrown: a throw in `beforeAll` aborts the file and reports its tests as
 * *skipped*, which a gate reading the output cannot tell from a harness that measured nothing
 * (tasks.md § preamble item 4). §1 asserts it in wording no other assertion here shares.
 */
let falhaNoPreparo: unknown = null
const criados: (string | number)[] = []

beforeAll(async () => {
  try {
    world = await buildWorld()

    const anonimo = async (marker: 'A' | 'B', quantidade: number) => {
      const row = await world.payload.create({
        collection: 'xpLedger',
        data: {
          // **No `perfil`** — CLR-011's tombstone, and the case `nivelDoLab` is documented to
          // count. It also keeps this fixture out of every per-profile reconciliation.
          perfil: null,
          acao: 'publicar_projeto',
          refTipo: 'projeto',
          // A different `refId` per side, because `chaveIdempotencia` is composed from
          // `(tenant, perfil, acao, refTipo, refId)` and two identical tuples collide on the
          // unique index rather than producing two entries.
          refId: marker === 'A' ? 90_001 : 90_002,
          quantidade,
          tenant: marker === 'A' ? world.orgA.id : world.orgB.id,
        } as never,
        overrideAccess: true,
      })
      criados.push((row as { id: string | number }).id)
    }

    await anonimo('A', EXTRA_A)
    await anonimo('B', EXTRA_B)
  } catch (err) {
    falhaNoPreparo = err
  }
}, 120_000)

afterAll(async () => {
  // Item 5 of the preamble: a test that leaves rows behind fails somebody else's file.
  for (const id of criados) {
    await world?.payload
      .delete({ collection: 'xpLedger', id, overrideAccess: true })
      .catch(() => undefined)
  }
}, 60_000)

/** The store an anonymous visitor on this organization's host is handed. */
const portaDe = async (marker: 'A' | 'B') =>
  getPublicLabLevelStore(marker === 'A' ? world.orgA.host : world.orgB.host)

/** `nivelDoLab`'s first argument, which this path has nothing to put in — see the reader. */
const SEM_PEDIDO = {} as never

describe('§1 — the harness ran, and the premise it rests on', () => {
  it('built a world with two ledgers to sum', () => {
    expect(falhaNoPreparo, `the harness never ran: ${String(falhaNoPreparo)}`).toBeNull()
    expect(criados).toHaveLength(2)
  })
})

describe('§2 — the aggregate, for a visitor with no session (FR-016, CLR-001)', () => {
  it('answers with this lab’s level and bar, where the session door refuses outright', async () => {
    const nivel = await nivelDoLab(SEM_PEDIDO, { getStore: async () => portaDe('A') })

    expect(nivel.xp).toBe(XP_DE_A)
    expect(nivel.nivel).toBe(NIVEL_DE_A)
    expect(nivel.progresso).toEqual({ atual: ATUAL_DE_A, de: REGRAS_XP_CITE.xpPorNivel })
  })

  it('counts the entries that name nobody, which is what CLR-011’s erasure leaves behind', async () => {
    // The control: without the anonymised entry this lab sums to the seeded one alone, so the
    // assertion above distinguishes a reader that counts them from one that does not.
    expect(XP_DE_A).toBeGreaterThan(REGRAS_XP_CITE.xpPorAcao)
    expect(NIVEL_DE_A).toBeGreaterThan(0)
  })

  it('reads the host from the request, as a server component reaches it', async () => {
    request.host = world.orgA.host
    const store = await getPublicLabLevelStoreForRSC()

    expect(String(store.tenantId)).toBe(String(world.orgA.id))
  })
})

describe('§3 — one lab, and never the sum of two (FR-029)', () => {
  it('gives each organization its own total, not the neighbour’s and not both', async () => {
    const a = await nivelDoLab(SEM_PEDIDO, { getStore: async () => portaDe('A') })
    const b = await nivelDoLab(SEM_PEDIDO, { getStore: async () => portaDe('B') })

    expect(a.xp).toBe(XP_DE_A)
    expect(b.xp).toBe(REGRAS_XP_CITE.xpPorAcao + EXTRA_B)
    expect(
      a.xp + b.xp,
      'both labs answered with the same number, which is what a dropped tenant clause produces.',
    ).not.toBe(a.xp)
  })
})

describe('§4 — the reach: two collections, and nothing adjacent to them', () => {
  it('refuses a collection it was not opened for, as a rejection rather than empty rows', async () => {
    const store = await portaDe('A')

    await expect(store.find({ collection: 'perfilMaker' })).rejects.toBeInstanceOf(
      PublicReadDeniedError,
    )
  })

  it('names the reason: the lab level is what it was opened for', async () => {
    const store = await portaDe('A')
    const erro = await store.find({ collection: 'projeto' }).catch((e: unknown) => e)

    expect(String(erro)).toContain('projeto')
    expect(String(erro)).toContain('the lab level')
  })

  it('serves the two it WAS opened for — so the refusals above mean something', async () => {
    const store = await portaDe('A')

    await expect(store.find({ collection: 'regrasXp' })).resolves.toBeDefined()
    await expect(store.find({ collection: 'xpLedger' })).resolves.toBeDefined()
  })
})

describe('§5 — the projection is FORCED, not asserted (CHK021’s lesson, one door on)', () => {
  it('fetches `quantidade` and nothing else of an entry’s activity log', async () => {
    const store = await portaDe('A')
    const { docs } = await store.find<Record<string, unknown>>({ collection: 'xpLedger' })

    expect(docs.length).toBeGreaterThan(0)
    for (const doc of docs) {
      for (const coluna of COLUNAS_DA_ATIVIDADE) {
        expect(
          doc[coluna],
          `the anonymous lab-level store fetched \`${coluna}\`. Together these columns are who ` +
            'earned what, for which action and when — the lab’s activity history, which is ' +
            'strictly more than the public ranking discloses.',
        ).toBeUndefined()
      }
    }
  })

  it('overwrites a caller’s wider select instead of merging it', async () => {
    const store = await portaDe('A')
    // The shape a later edit to `sumLedger` — a shared function with signed-in callers — could
    // introduce without anyone thinking about this door.
    const { docs } = await store.find<Record<string, unknown>>({
      collection: 'xpLedger',
      select: { quantidade: true, perfil: true, acao: true, createdAt: true },
    })

    expect(docs[0]).toBeDefined()
    expect(
      docs[0]?.perfil,
      'a caller widened the anonymous projection by passing its own `select`. The store must ' +
        'name the columns itself — asserting the caller passed one is the weaker gate, and the ' +
        'callers here live in `lib/content/xp.ts` with signed-in callers of their own.',
    ).toBeUndefined()
    expect(docs[0]?.acao).toBeUndefined()
    expect(docs[0]?.quantidade).toBeDefined()
  })

  it('the constant it forces is the one column, so a widening there is a diff in one place', () => {
    expect(Object.keys(CAMPOS_DA_SOMA)).toEqual(['quantidade'])
    expect(Object.values(CAMPOS_DA_SOMA).every((keep) => keep === true)).toBe(true)
  })

  it('a relationship cannot be populated around the projection — depth is forced to 0', async () => {
    const store = await portaDe('A')
    const { docs } = await store.find<Record<string, unknown>>({
      collection: 'xpLedger',
      depth: 2,
    })

    for (const doc of docs) expect(doc.perfil).toBeUndefined()
  })
})

describe('§6 — a `where` is refused, because a filter is how a sum becomes a person', () => {
  it('refuses a `perfil` filter, which would return one maker’s total', async () => {
    const store = await portaDe('A')
    const alvo = world.rows.perfilMaker!.A

    const erro = await store
      .find({ collection: 'xpLedger', where: { perfil: { equals: alvo } } as never })
      .catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(PublicReadDeniedError)
    expect(String(erro)).toContain('WHOLE ledger')
  })

  it('refuses a date filter, which would date a lab’s activity a page at a time', async () => {
    const store = await portaDe('A')

    await expect(
      store.find({
        collection: 'xpLedger',
        where: { createdAt: { greater_than: '2026-01-01' } } as never,
      }),
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })

  it('refuses one on `regrasXp` too — the rule is the store’s, not one collection’s', async () => {
    const store = await portaDe('A')

    await expect(
      store.find({ collection: 'regrasXp', where: { xpPorAcao: { equals: 1 } } as never }),
    ).rejects.toBeInstanceOf(PublicReadDeniedError)
  })
})

describe('§7 — an unresolved host is the site 404, never a lab at level 0', () => {
  it('throws TenantUnresolvedError rather than opening a store with no tenant', async () => {
    await expect(getPublicLabLevelStore('nao-existe.localhost')).rejects.toBeInstanceOf(
      TenantUnresolvedError,
    )
  })
})
