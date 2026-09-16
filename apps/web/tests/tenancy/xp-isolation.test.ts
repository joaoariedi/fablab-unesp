import type { XpRules } from '@fablab/game'
import type { PayloadRequest } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { creditXp, nivelDoLab } from '../../lib/content/xp'
import { lookupOrganizationByHost } from '../../lib/tenancy/resolve'
import type { TenantScopedPayload } from '../../lib/tenancy/client'
import { getTenantScopedPayload } from '../../lib/tenancy/scoped-payload'
import { buildWorld, type Fixture } from './fixtures'

/**
 * **The `xp-ledger` isolation layer's harness** (T046, SC-010, FR-035, US7).
 *
 * `isolation.test.ts` asks *"what rows can this user SEE"* over every scoped collection, and
 * that question already covers `xpLedger` as a table. This file asks the other one, which no
 * read matrix can: **what does an ACTION at lab A do to lab B?** XP is the first thing in the
 * product where a maker's own act writes a total somewhere, so a mis-scoped client here does
 * not leak a row into a list — it *mints* one, at a lab nobody acted in, and every projection
 * downstream inherits it as if it had been earned.
 *
 * `creditXp` is that client's one chooser, which is why D7 put the layer's mutation point on
 * its choice — the line `xp-mutation-point.test.ts` pins, T045 — rather than on the machinery the four
 * older layers rewrite.
 *
 * ## The four XP surfaces, and why each is its own vantage point
 *
 *   - `xpLedger`     — the entries themselves, read through the lab's own choke point
 *   - `nivelDoLab`   — FR-012's projection of the WHOLE organization's ledger, which is the
 *                      one surface that moves even for an entry naming no profile (CLR-011)
 *   - `ranking`      — FR-013's board: `perfilMaker.xpTotal` across the lab's makers
 *   - `painelSkills` — US9's SUAS SKILLS rows, `perfilMaker.skills[].xp`
 *
 * They are **not** one surface counted four ways. A credit writes the entry through one client
 * and the projections through another call on it, so a mis-scoped store can move the ledger of
 * one lab and the totals of another — a state in which every single-surface harness is green
 * and the product is telling two labs two different stories about the same act.
 *
 * ## Why the measurements are deltas, and the assertion a COUNT
 *
 * T046 requires the layer's `EVIDENCE` to be *"a message only the counting assertion can
 * print, never a setup failure"*. Two things make that true here:
 *
 *   1. The world, the credits and the measurements all happen in `beforeAll`, and **every
 *      failure there is captured rather than thrown**. A throw in `beforeAll` does not fail a
 *      test — it aborts the file and reports its tests as *skipped* (tasks.md § preamble item
 *      4, measured at 160 silent tests in 002), which a gate reading the output cannot tell
 *      from a harness that never noticed a leak. The capture is asserted by the first test,
 *      whose message deliberately shares no phrase with the counting ones.
 *   2. A leak here is a **number that moved**, so the assertion prints the movement. No setup
 *      path can produce that sentence, because no setup path computes a delta.
 */

/** Everything a vantage point needs to read one lab, and to earn one credit in it. */
type Lado = {
  marca: 'A' | 'B'
  host: string
  user: Record<string, unknown>
  perfil: string | number
  skill: string | number
  /** The content the credit refers to — this lab's own article, never the neighbour's. */
  artigo: string | number
}

/** One vantage point's reading of one lab, as a single number a credit is expected to move. */
type Medidas = Record<string, number>

/** Both labs, measured at the same instant. */
type Instantaneo = { A: Medidas; B: Medidas }

const pedidoDe = (lado: Lado): PayloadRequest =>
  ({ user: lado.user, headers: new Headers({ 'x-tenant-host': lado.host }) }) as unknown as PayloadRequest

/**
 * The lab's own choke point, as a signed-in maker of that lab reaches it.
 *
 * `lookup` is injected for spike S8's reason — the cached default reaches for `next/cache`,
 * which is not a thing a vitest process has — and for no other: this is the same client every
 * page and every hook uses.
 */
const clienteDe = (lado: Lado): Promise<TenantScopedPayload> =>
  getTenantScopedPayload(pedidoDe(lado), { lookup: lookupOrganizationByHost })

/** Every row this lab's ledger holds. The count, not the rows: a page of them is not the point. */
const entradasDoLedger = async (lado: Lado): Promise<number> => {
  const db = await clienteDe(lado)
  const { totalDocs } = await db.find({ collection: 'xpLedger', limit: 1, depth: 0 })
  return totalDocs
}

/** FR-012's projection, through the function the NÍVEL DO LAB card actually calls. */
const xpDoLab = async (lado: Lado): Promise<number> => (await nivelDoLab(pedidoDe(lado))).xp

/** Every profile of this lab, as the ranking and the panel both read them. */
const perfisDe = async <T>(lado: Lado): Promise<T[]> => {
  const db = await clienteDe(lado)
  const { docs } = await db.find<T>({ collection: 'perfilMaker', limit: 100, depth: 0 })
  return docs
}

const numero = (valor: unknown): number => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0)

/** FR-013's board, summed: a credit at the wrong lab moves somebody's place on it. */
const xpDoRanking = async (lado: Lado): Promise<number> => {
  const perfis = await perfisDe<{ xpTotal?: unknown }>(lado)
  return perfis.reduce((total, perfil) => total + numero(perfil.xpTotal), 0)
}

/** US9's SUAS SKILLS rows, summed across the lab — the projection `skills[]` stores. */
const xpDoPainel = async (lado: Lado): Promise<number> => {
  const perfis = await perfisDe<{ skills?: { xp?: unknown }[] }>(lado)
  return perfis.reduce(
    (total, perfil) => total + (perfil.skills ?? []).reduce((soma, linha) => soma + numero(linha.xp), 0),
    0,
  )
}

/**
 * The four vantage points, each with what ONE credit is expected to move at the lab that
 * earned it — the teeth. Without that half a blanket refusal passes every assertion below
 * while the feature is dead: nothing moved at B because nothing moved anywhere.
 *
 * The expected movement is read off the lab's OWN economy (CLR-010), never written as `1`:
 * a lab that retuned `xpPorAcao` legitimately would fail a harness that hardcoded the seed.
 */
const SUPERFICIES: {
  nome: string
  medir: (lado: Lado) => Promise<number>
  movimento: (regras: XpRules) => number
}[] = [
  { nome: 'xpLedger', medir: entradasDoLedger, movimento: () => 1 },
  { nome: 'nivelDoLab', medir: xpDoLab, movimento: (regras) => regras.xpPorAcao },
  { nome: 'ranking', medir: xpDoRanking, movimento: (regras) => regras.xpPorAcao },
  { nome: 'painelSkills', medir: xpDoPainel, movimento: (regras) => regras.xpPorAcao },
]

const regrasDe = async (lado: Lado): Promise<XpRules> => {
  const db = await clienteDe(lado)
  const { docs } = await db.find<Partial<Record<keyof XpRules, unknown>>>({
    collection: 'regrasXp',
    limit: 1,
    depth: 0,
  })
  const linha = docs[0] ?? {}
  return {
    xpPorAcao: numero(linha.xpPorAcao),
    xpPorNivel: numero(linha.xpPorNivel),
    nivelMaximo: numero(linha.nivelMaximo),
  }
}

/**
 * One credit, through the real choke point and with **no injected deps** — which is the whole
 * point: `deps.getStore` is the seam every other XP test uses, and a harness that used it
 * would assert something about its own stub instead of about the client `creditXp` picks.
 *
 * `publicar_artigo` on this lab's own article, because the fixture already seeded a
 * `publicar_projeto` entry for the seeded project and FR-003's key would make a second one a
 * no-op — a credit that writes nothing moves nothing, and every delta below would be zero for
 * a reason that has nothing to do with tenancy.
 */
const creditar = (lado: Lado): Promise<boolean> =>
  creditXp({
    req: pedidoDe(lado),
    perfil: lado.perfil,
    skill: lado.skill,
    acao: 'publicar_artigo',
    refTipo: 'artigo',
    refId: Number(lado.artigo),
  })

let world: Fixture
let ladoA: Lado
let ladoB: Lado
let regras: Record<'A' | 'B', XpRules>
let antes: Instantaneo
let aposCreditoEmA: Instantaneo
let aposCreditoEmB: Instantaneo
/** What the two credits answered — `true` for written, or the error each raised. */
const credito: Record<'A' | 'B', { escreveu?: boolean; erro?: unknown }> = { A: {}, B: {} }
/** Anything that went wrong building the world, so the file fails loudly instead of skipping. */
let falhaDeMontagem: unknown

const medir = async (): Promise<Instantaneo> => {
  const ler = async (lado: Lado): Promise<Medidas> => {
    const medidas: Medidas = {}
    for (const { nome, medir: vantagem } of SUPERFICIES) medidas[nome] = await vantagem(lado)
    return medidas
  }
  return { A: await ler(ladoA), B: await ler(ladoB) }
}

/** A credit that throws is RECORDED, never rethrown — see the header's point 1. */
const creditarRegistrando = async (lado: Lado): Promise<void> => {
  try {
    credito[lado.marca].escreveu = await creditar(lado)
  } catch (erro) {
    credito[lado.marca].erro = erro
  }
}

beforeAll(async () => {
  try {
    world = await buildWorld()
    const lado = (marca: 'A' | 'B', org: { host: string }, user: Record<string, unknown>): Lado => ({
      marca,
      host: org.host,
      user,
      perfil: world.rows.perfilMaker![marca],
      skill: world.rows.skill![marca],
      artigo: world.rows.artigo![marca],
    })
    ladoA = lado('A', world.orgA, world.userA)
    ladoB = lado('B', world.orgB, world.userB)
    regras = { A: await regrasDe(ladoA), B: await regrasDe(ladoB) }

    antes = await medir()
    await creditarRegistrando(ladoA)
    aposCreditoEmA = await medir()
    await creditarRegistrando(ladoB)
    aposCreditoEmB = await medir()
  } catch (erro) {
    falhaDeMontagem = erro
  }
}, 180_000)

describe('xp isolation: an action at one lab (SC-010, FR-035)', () => {
  it('built two labs, each with an economy, a maker and an article', () => {
    // Deliberately worded to share no phrase with the counting assertions: this is where a
    // broken database, a missing fixture row or an unresolvable host reports, and the layer
    // must be able to tell that apart from a leak it detected.
    expect(falhaDeMontagem, `the world could not be built: ${String(falhaDeMontagem)}`).toBeUndefined()
    for (const [marca, economia] of Object.entries(regras)) {
      expect(
        economia.xpPorAcao,
        `organização ${marca} has no economy with a positive xpPorAcao, so no credit could ` +
          `move any number and every vantage point below would pass while asserting nothing`,
      ).toBeGreaterThan(0)
    }
  })

  it('drives every XP surface the requirement names', () => {
    // A NAMED set, not a count — the lesson `isolation.test.ts` records: a count passes if
    // somebody deletes the ranking and adds a second, easier ledger read.
    const nomes = SUPERFICIES.map(({ nome }) => nome)
    for (const exigida of ['xpLedger', 'nivelDoLab', 'ranking', 'painelSkills']) {
      expect(nomes, `XP surface '${exigida}' is missing — SC-010 is not being met`).toContain(exigida)
    }
  })

  it('the credit under test actually landed, at both labs', () => {
    for (const marca of ['A', 'B'] as const) {
      expect(
        credito[marca].erro,
        `the credit at ${marca} raised ${String(credito[marca].erro)} instead of writing an entry`,
      ).toBeUndefined()
      expect(
        credito[marca].escreveu,
        `creditXp returned false at ${marca}: the action was read as already credited, so ` +
          `nothing was written and no vantage point below could have moved`,
      ).toBe(true)
    }
  })

  for (const { nome, movimento } of SUPERFICIES) {
    it(`${nome}: a credit earned at A moves nothing at B`, () => {
      const desvio = (aposCreditoEmA.B[nome] ?? 0) - (antes.B[nome] ?? 0)
      expect(
        desvio,
        `${nome}: organização B moved by ${desvio} while a maker of A earned — XP credited ` +
          `at the wrong lab (SC-010). Nothing happened at B: no entry, no approval, no watch.`,
      ).toBe(0)

      // The teeth, and they come second on purpose: a blanket refusal would satisfy the
      // assertion above with the whole feature dead, and this is the half that notices.
      const proprio = (aposCreditoEmA.A[nome] ?? 0) - (antes.A[nome] ?? 0)
      expect(
        proprio,
        `${nome}: the credit earned at A moved A by ${proprio} instead of ` +
          `${movimento(regras.A)} — the isolation above is passing because nothing works`,
      ).toBe(movimento(regras.A))
    })

    it(`${nome}: the mirror holds — a credit earned at B moves nothing at A`, () => {
      const desvio = (aposCreditoEmB.A[nome] ?? 0) - (aposCreditoEmA.A[nome] ?? 0)
      expect(
        desvio,
        `${nome}: organização A moved by ${desvio} while a maker of B earned — XP credited ` +
          `at the wrong lab (SC-010). Nothing happened at A: no entry, no approval, no watch.`,
      ).toBe(0)

      const proprio = (aposCreditoEmB.B[nome] ?? 0) - (aposCreditoEmA.B[nome] ?? 0)
      expect(
        proprio,
        `${nome}: the credit earned at B moved B by ${proprio} instead of ` +
          `${movimento(regras.B)} — the isolation above is passing because nothing works`,
      ).toBe(movimento(regras.B))
    })
  }

  it("no entry in one lab's ledger names the other lab's maker or skill", async () => {
    // The delta assertions catch a number that moved. This catches the row that moved WITHOUT
    // moving a number — an entry minted at B for A's profile fails `syncMakerProjections`
    // after the create has already committed, so B's totals can sit still while B's history
    // acquires a maker it has never had.
    for (const [anfitriao, visitante] of [
      [ladoB, ladoA],
      [ladoA, ladoB],
    ] as const) {
      const db = await clienteDe(anfitriao)
      const { docs } = await db.find<{ perfil?: unknown; skill?: unknown }>({
        collection: 'xpLedger',
        limit: 200,
        depth: 0,
      })
      const estrangeiras = docs.filter(
        (entrada) =>
          String(entrada.perfil) === String(visitante.perfil) ||
          String(entrada.skill) === String(visitante.skill),
      )
      expect(
        estrangeiras.length,
        `organização ${anfitriao.marca}'s ledger holds ${estrangeiras.length} entry(ies) ` +
          `naming organização ${visitante.marca}'s maker or skill — XP credited at the wrong ` +
          `lab (SC-010)`,
      ).toBe(0)
    }
  })
})
