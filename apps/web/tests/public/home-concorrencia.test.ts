import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstadoPessoal } from '../../lib/content/missoes'
import type { NivelDoLab } from '../../lib/content/xp'
import type { MissaoIdentificada } from '../../lib/public/missoes'
import type { PaginatedResult } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T026, T033 / FR-026, FR-025, CLR-006, CLR-012, SC-012 — how the Home ISSUES its reads.
 *
 * Every other file in `tests/public/home-*` asks what a block DREW. This one asks only *when*
 * the four reads left, and what happens to the page when one of them cannot name an
 * organization. Two things, both invisible in the rendered tree:
 *
 *   * **The four block reads are issued together** (FR-026, CLR-006). The Home's hero is the
 *     LCP element and `/` is one of the six pages `scripts/lcp-budget.sh` measures, so three
 *     new reads in series would add three round trips ahead of the hero's bytes. The reads are
 *     independent by construction — missions, the ledger sum, the board and the projects share
 *     no input — so nothing but the code's shape makes them serial.
 *   * **The personal overlay is a FIFTH read, outside those four** (CLR-012). It needs the
 *     mission ids to build its `where`, so it cannot be issued beside them, and a visitor with
 *     no session never makes it at all — which is the path the budget measures. §2 asserts it
 *     lands *after* the four resolve and is asked about the missions that actually came back,
 *     so "four" can never quietly come to mean "four of five".
 *
 * ── The instrument: an event order, never a clock (plan § Sketch 7) ─────────────────────────
 *
 * A wall-time assertion — *"the page took less than the sum of its reads"* — is flaky on a
 * loaded CI box and proves nothing about intent. So each fake read records `emitida:<bloco>`
 * when it is CALLED and `resolvida:<bloco>` one macrotask later. In series, `resolvida:projetos`
 * lands before the second read is emitted; concurrently, all four `emitida:` come first. That is
 * a statement about the order of events, and it is exact.
 *
 * § 1 is T033's own row, and a test that asserts an ordering only ever proves something if a
 * wrong ordering turns it red. Three mutations of `HomePage`'s read statement were run against
 * a scratch copy of the page, and each was killed by the assertion that names it:
 *
 *   * the four `await`-ed one at a time → *"the Home awaited a read before issuing the next"*;
 *   * two pairs, each pair in its own `Promise.all` → the same assertion, so HALF-serial is
 *     caught too and "concurrent" cannot come to mean "concurrent in places";
 *   * all four overlapping but the ranking issued **twice** → *"issued a number of times that
 *     is not one"*, which is the round trip a still-concurrent page can add without any
 *     ordering assertion noticing.
 *
 * ── Why `TenantUnresolvedError` is in this file and not in the panels' ──────────────────────
 *
 * FR-025 is a property of each READER, not of a rendered block: an unresolved host is the
 * site's 404 and must never be caught as a block failure. §3 drives all four readers one at a
 * time, and pairs each with the case that keeps the assertion honest — an ORDINARY failure in
 * the same reader, which must stay a block failure and never become a 404. A page that answered
 * `notFound()` for every error would satisfy the first half of §3 and fail the second.
 */

/** Three missions, as the band's read returns them — ids are what the fifth read needs. */
const MISSOES = [
  { id: 101, titulo: 'Primeira impressão 3D' },
  { id: 102, titulo: 'Corte a laser' },
  { id: 103, titulo: 'Solde um circuito' },
] as const

/** A lab with a ledger, so the level card is a value rather than a failure (CLR-011). */
const NIVEL: NivelDoLab = { xp: 16, nivel: 3, progresso: { atual: 1, de: 5 } }

const semProjetos = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }

/**
 * The record every assertion in §1 and §2 reads.
 *
 * Module scope rather than a closure because the mocked modules are hoisted above this file's
 * body; `beforeEach` empties it in place, so the array identity the fakes captured stays valid.
 */
const eventos: string[] = []

/** One macrotask. Long enough that a serial page's first read RESOLVES before its second is
 *  emitted, which is the whole difference §1 is looking at. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A read that takes measurable time and says so at both ends.
 *
 * Named, not an inline stub, and shared by all five fakes: the events would mean nothing if
 * each block recorded them at a different moment in its own lifecycle.
 */
async function leituraLenta<T>(bloco: string, valor: T): Promise<T> {
  eventos.push(`emitida:${bloco}`)
  await tick()
  eventos.push(`resolvida:${bloco}`)
  return valor
}

/** The anonymous door. Its `find` is the band's read, and the only read this fake serves. */
class FakePublicClient {
  readonly tenantId = 'org-fake'
  find = async <T>(): Promise<PaginatedResult<T>> =>
    leituraLenta('missoes', {
      docs: [...MISSOES] as unknown as T[],
      totalDocs: MISSOES.length,
    })

  findByID = async <T>(): Promise<T | null> => null
}

/** The signed-in choke point. `nivelDoLab` is faked whole, so this store is never read through
 *  — the page's orchestration is this file's subject, not the level arithmetic. */
class FakeLedgerStore {
  readonly tenantId = 'org-fake'
  find = async <T>(): Promise<PaginatedResult<T>> => ({ docs: [], totalDocs: 0 })
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    listPublic: vi.fn(),
    getPublicScopedPayloadForRSC: vi.fn(),
    getTenantScopedPayloadForRSC: vi.fn(),
    getPublicLabLevelStoreForRSC: vi.fn(),
    nivelDoLab: vi.fn(),
    readPublicRanking: vi.fn<(limite: number) => Promise<unknown[] | null>>(),
    estadoPessoal: vi.fn<(missoes: readonly MissaoIdentificada[]) => Promise<EstadoPessoal>>(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
  readPublicRanking: mocks.readPublicRanking,
  // The lab level's door since T023. `nivelDoLab` is replaced below, so the store is never
  // read — it only has to resolve, or `next/headers` throws outside a Next request scope.
  getPublicLabLevelStoreForRSC: mocks.getPublicLabLevelStoreForRSC,
}))

vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

/**
 * `nivelDoLab` is replaced rather than driven: it reads `regrasXp` and then sums `xpLedger`,
 * two reads of its own, and this file counts the page's four. Faking it makes the lab block
 * exactly one event pair, which is what §1 can reason about.
 */
vi.mock('../../lib/content/xp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/content/xp')>()),
  nivelDoLab: mocks.nivelDoLab,
}))

vi.mock('../../lib/public/missoes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/missoes')>()),
  estadoPessoal: mocks.estadoPessoal,
}))

const { default: HomePage } = (await import('../../app/(frontend)/page')) as {
  default: () => Promise<ReactElement>
}

/** The four blocks FR-026 counts, and the one CLR-012 deliberately leaves out. */
const OS_QUATRO = ['projetos', 'missoes', 'nivel', 'ranking'] as const
const emitidas = (nomes: readonly string[]): string[] => nomes.map((n) => `emitida:${n}`).sort()

describe('§1 — the four block reads are issued together (T033, FR-026, SC-012, CLR-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventos.length = 0
    mocks.listPublic.mockImplementation(async () => leituraLenta('projetos', semProjetos))
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
    mocks.getPublicLabLevelStoreForRSC.mockResolvedValue(new FakeLedgerStore())
    mocks.nivelDoLab.mockImplementation(async () => leituraLenta('nivel', NIVEL))
    mocks.readPublicRanking.mockImplementation(async () => leituraLenta('ranking', []))
    mocks.estadoPessoal.mockImplementation(async () => {
      eventos.push('emitida:pessoal')
      await tick()
      eventos.push('resolvida:pessoal')
      return { tipo: 'anonimo' }
    })
  })

  it('emits all four before the first one resolves', async () => {
    await HomePage()

    const primeiras = eventos.slice(0, 4)
    expect(
      primeiras.filter((evento) => evento.startsWith('resolvida:')),
      `the Home awaited a read before issuing the next one. The event order was ` +
        `[${eventos.join(', ')}]; FR-026 wants the four block reads in ONE \`Promise.all\`, ` +
        `because \`/\` carries the LCP element and every serial read is a round trip ahead of ` +
        `the hero's bytes (CLR-006).`,
    ).toEqual([])
    expect(
      primeiras.sort(),
      `the first four events are not the four block reads being issued. Observed ` +
        `[${eventos.join(', ')}].`,
    ).toEqual(emitidas(OS_QUATRO))
  })

  it('issues each of the four exactly once — a second call is a second round trip', async () => {
    await HomePage()

    for (const bloco of OS_QUATRO) {
      expect(
        eventos.filter((evento) => evento === `emitida:${bloco}`),
        `the \`${bloco}\` read was issued a number of times that is not one. Observed ` +
          `[${eventos.join(', ')}].`,
      ).toHaveLength(1)
    }
  })
})

describe('§2 — the personal overlay is a FIFTH read, outside the four (T026, CLR-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventos.length = 0
    mocks.listPublic.mockImplementation(async () => leituraLenta('projetos', semProjetos))
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
    mocks.getPublicLabLevelStoreForRSC.mockResolvedValue(new FakeLedgerStore())
    mocks.nivelDoLab.mockImplementation(async () => leituraLenta('nivel', NIVEL))
    mocks.readPublicRanking.mockImplementation(async () => leituraLenta('ranking', []))
    mocks.estadoPessoal.mockImplementation(async () => {
      eventos.push('emitida:pessoal')
      await tick()
      eventos.push('resolvida:pessoal')
      return { tipo: 'anonimo' }
    })
  })

  it('is issued only after the band’s read has resolved', async () => {
    await HomePage()

    const pessoal = eventos.indexOf('emitida:pessoal')
    expect(
      pessoal,
      `the personal overlay was never issued. Observed [${eventos.join(', ')}].`,
    ).toBeGreaterThan(-1)
    expect(
      pessoal,
      `the personal overlay was issued before the missions resolved, so it cannot have been ` +
        `built from their ids — the very reason CLR-012 puts it outside FR-026's four. ` +
        `Observed [${eventos.join(', ')}].`,
    ).toBeGreaterThan(eventos.indexOf('resolvida:missoes'))
  })

  it('is asked about the missions that actually came back, and nothing wider', async () => {
    await HomePage()

    expect(mocks.estadoPessoal).toHaveBeenCalledTimes(1)
    const perguntadas = mocks.estadoPessoal.mock.calls[0]?.[0] ?? []
    expect(
      [...perguntadas].map((missao) => missao.id),
      `the overlay was asked about a set of missions that is not the three on screen. Issuing ` +
        `it unfiltered would read every submission in the lab to use three (CLR-012).`,
    ).toEqual(MISSOES.map((missao) => missao.id))
  })
})

describe('§3 — every reader turns `TenantUnresolvedError` into `notFound()` (T026, FR-025)', () => {
  /** Each reader's failure point, named by the block it belongs to. */
  const falhar = (bloco: (typeof OS_QUATRO)[number], erro: Error): void => {
    if (bloco === 'projetos') mocks.listPublic.mockRejectedValue(erro)
    if (bloco === 'missoes') {
      mocks.getPublicScopedPayloadForRSC.mockResolvedValue({
        tenantId: 'org-fake',
        find: async () => {
          throw erro
        },
        findByID: async () => null,
      })
    }
    if (bloco === 'nivel') mocks.nivelDoLab.mockRejectedValue(erro)
    if (bloco === 'ranking') mocks.readPublicRanking.mockRejectedValue(erro)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    eventos.length = 0
    // Quiet: the contained-failure cases below log by design, and a red suite is easier to read
    // without four expected warnings in it.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.listPublic.mockResolvedValue(semProjetos)
    mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
    mocks.getPublicLabLevelStoreForRSC.mockResolvedValue(new FakeLedgerStore())
    mocks.nivelDoLab.mockResolvedValue(NIVEL)
    mocks.readPublicRanking.mockResolvedValue([])
    mocks.estadoPessoal.mockResolvedValue({ tipo: 'anonimo' })
  })

  for (const bloco of OS_QUATRO) {
    it(`404s the whole page when the ${bloco} read cannot resolve a host`, async () => {
      falhar(bloco, new TenantUnresolvedError('lab.exemplo.test'))

      await expect(
        HomePage(),
        `the ${bloco} read swallowed a \`TenantUnresolvedError\`. A host that belongs to no ` +
          `organization is the SITE's 404 (FR-025) — caught as a block failure it draws an ` +
          `error card on a page that should not exist.`,
      ).rejects.toBe(mocks.NOT_FOUND)
      expect(mocks.notFound).toHaveBeenCalled()
    })
  }

  it('does NOT 404 on an ordinary failure — that stays the block’s (FR-023)', async () => {
    falhar('missoes', new Error('connection reset by peer'))

    await expect(
      HomePage(),
      `an ordinary read failure became the site's 404. FR-023 contains it in its own block: a ` +
        `page that answers \`notFound()\` for every error would pass the four cases above ` +
        `while asserting nothing about \`TenantUnresolvedError\` at all.`,
    ).resolves.toBeDefined()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})
