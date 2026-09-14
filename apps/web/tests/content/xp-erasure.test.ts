import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { XpLedger } from '../../collections/content/XpLedger'
import { deleteAccount, type DeletionStore } from '../../lib/accounts/deletion'
import type { ByIDArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T011c / SC-021, FR-012 — **the lab does not shrink because somebody left, and the record says so.**
 *
 * CLR-011 decided that erasing a profile *nulls* `xpLedger.perfil` and leaves every other
 * column alone. T011b implemented that; `delete-account.test.ts` asserts the row shape it
 * leaves behind. What neither of them asserts is the **consequence** the clarification was
 * argued from, and the one SC-021 measures: the **Nível do Lab** — a projection of the
 * organization's whole ledger (FR-012) — is the same number before and after an erasure.
 *
 * The two are not the same claim. A row keeping its `quantidade` is a fact about one table; the
 * lab's level is a fact about the *sum over every entry, including the ones that now name
 * nobody*. An implementation that deleted the rows, or that zeroed the amount while nulling the
 * profile, satisfies "the entry survives" in spirit and drops the lab a level in public — and
 * nothing else in the tree would notice, because no maker's own total changed: the departing
 * maker's total went away with them, legitimately.
 *
 * ── Why the curve is modelled here and not imported ────────────────────────────────────────
 *
 * `levelFor` lives in `@fablab/game`, which `apps/web` does not depend on yet — the credit path
 * adds that in phase 3 (`RegrasXp.ts` records the same constraint), and `lib/content/xp.ts`,
 * where the lab level becomes a real reader, is T044. So {@link nivelDoLab} below is a
 * deliberate stand-in for a projection that does not exist yet, written from FR-007's rule
 * against **injected** rules (CLR-001), never against the CITe seed numbers.
 *
 * A stand-in can assert its own fixture, which would make this file worthless. § "a apuração
 * distingue" is the guard: it asserts the fixture is one where dropping the erased maker's
 * entries **does** change the level, so the invariant below has something to fail against.
 * When T044 ships, this helper should be deleted and the real projection imported in its place.
 *
 * ── Why a named fake and not Postgres ──────────────────────────────────────────────────────
 *
 * The claim is about which rows `deleteAccount` leaves in the table, and the fake's `delete`
 * really removes them — an implementation that deleted the entries visibly empties the world
 * here. `delete-account.test.ts` splits the same way, for the same reason.
 */

const LAB = 'org-bauru'

/** The person being erased: profile 7 in this lab, account 42. */
const PERFIL = 7
const CONTA = 42
/** Two other makers, whose credits are what the lab keeps regardless. */
const PERFIL_ALHEIO = 8
const CONTA_ALHEIA = 99

const REQ = { id: 'req-t011c', user: { id: CONTA } } as unknown as PayloadRequest

/**
 * One organization's economy, **injected**. CLR-001: a test asserting "the cap is 10" asserts a
 * seed value and fails on a lab that retuned legitimately. These numbers are this test's own.
 */
const REGRAS = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

/**
 * The fixture's whole point, in four numbers: the lab holds **15** XP and therefore level 3,
 * and the departing maker earned **4** of it. Drop those and the lab reads 11 — level 2. The
 * erasure must leave 15.
 */
const XP_DA_PESSOA = [3, 1]
const XP_DE_OUTROS = [6, 5]

type LinhaLedger = {
  id: number
  perfil: string | number | null
  acao: string
  refTipo: string
  refId: number
  quantidade: number
  chaveIdempotencia: string
}
type LinhaPerfil = { id: number; usuario: number }
type LinhaConta = { id: number; orgs: { organization: string }[] }
type LinhaConteudo = { id: number; autor: string | number | null }

type Mundo = {
  perfis: LinhaPerfil[]
  contas: LinhaConta[]
  conteudos: Record<string, LinhaConteudo[]>
  xpLedger: LinhaLedger[]
}

const entrada = (
  id: number,
  perfil: number | null,
  quantidade: number,
  refId: number,
): LinhaLedger => ({
  id,
  perfil,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
  refId,
  quantidade,
  chaveIdempotencia: `1:${String(perfil)}:publicar_artigo:artigo:${refId}`,
})

const mundoPadrao = (): Mundo => ({
  perfis: [
    { id: PERFIL, usuario: CONTA },
    { id: PERFIL_ALHEIO, usuario: CONTA_ALHEIA },
  ],
  contas: [
    { id: CONTA, orgs: [{ organization: LAB }] },
    { id: CONTA_ALHEIA, orgs: [{ organization: LAB }] },
  ],
  // The work the departing maker published: kept, byline nulled (CLR-003). Present so the
  // erasure runs its real path rather than a degenerate one with nothing to anonymise.
  conteudos: {
    artigo: [
      { id: 31, autor: PERFIL },
      { id: 32, autor: PERFIL },
      { id: 41, autor: PERFIL_ALHEIO },
    ],
    aula: [],
    modelo3d: [],
  },
  xpLedger: [
    ...XP_DA_PESSOA.map((q, i) => entrada(101 + i, PERFIL, q, 31 + i)),
    ...XP_DE_OUTROS.map((q, i) => entrada(201 + i, PERFIL_ALHEIO, q, 41 + i)),
  ],
})

/**
 * FR-012's projection, modelled: the level for **the whole organization's ledger**, on the same
 * curve as a maker's (FR-007).
 *
 * `perfil` is never consulted — that is the requirement, not an omission. An entry that names
 * nobody is XP the lab really earned, and a reader that filtered on the profile would reproduce
 * exactly the bug CLR-011 rejected deleting the rows to avoid.
 */
const nivelDoLab = (entradas: LinhaLedger[], regras: typeof REGRAS): number => {
  const total = entradas.reduce((soma, e) => soma + e.quantidade, 0)
  return Math.max(0, Math.min(regras.nivelMaximo, Math.floor(total / regras.xpPorNivel)))
}

const xpDoLab = (entradas: LinhaLedger[]): number =>
  entradas.reduce((soma, e) => soma + e.quantidade, 0)

/** A `where` as `deletion.ts` writes it, flattened — assertions are about clauses, not nesting. */
const clausulas = (where: unknown): Record<string, { equals?: unknown }> => {
  const w = (where ?? {}) as Record<string, unknown> & { and?: unknown[] }
  if (Array.isArray(w.and)) return Object.assign({}, ...w.and.map(clausulas))
  return w as Record<string, { equals?: unknown }>
}

const igual = (where: unknown, campo: string): unknown => clausulas(where)[campo]?.equals

/**
 * A named fake for the choke-point client, holding a **real world**: every delete and update
 * mutates the rows, so what the level is computed from afterwards is what the module actually
 * left behind and not what the fake was told to report.
 */
class FakeDeletionStore implements DeletionStore {
  readonly tenantId = LAB

  constructor(readonly mundo: Mundo = mundoPadrao()) {}

  private linhas(collection: string): LinhaConteudo[] {
    return this.mundo.conteudos[collection] ?? []
  }

  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    const docs = this.buscar(args) as T[]
    return { docs, totalDocs: docs.length }
  }

  private buscar(args: FindArgs): unknown[] {
    // No likes in this world: the counters are `delete-account.test.ts`'s claim, not this one.
    if (args.collection === 'curtida') return []
    if (args.collection === 'perfilMaker') {
      const usuario = igual(args.where, 'usuario')
      return this.mundo.perfis.filter((p) => usuario === undefined || p.usuario === usuario)
    }
    if (args.collection === 'xpLedger') {
      const perfil = igual(args.where, 'perfil')
      return this.mundo.xpLedger.filter((e) => perfil === undefined || e.perfil === perfil)
    }
    const autor = igual(args.where, 'autor')
    return this.linhas(args.collection).filter((c) => autor === undefined || c.autor === autor)
  }

  findByID = async <T>(args: ByIDArgs): Promise<T | null> => {
    if (args.collection === 'perfilMaker') {
      return (this.mundo.perfis.find((p) => p.id === args.id) ?? null) as T | null
    }
    if (args.collection === 'users') {
      return (this.mundo.contas.find((c) => c.id === args.id) ?? null) as T | null
    }
    return (this.linhas(args.collection).find((c) => c.id === args.id) ?? null) as T | null
  }

  update = async <T>(args: UpdateArgs): Promise<T | null> => {
    const alvo: { id: number } | undefined =
      args.collection === 'xpLedger'
        ? this.mundo.xpLedger.find((e) => e.id === args.id)
        : this.linhas(args.collection).find((c) => c.id === args.id)
    if (!alvo) return null
    Object.assign(alvo, args.data)
    return alvo as T
  }

  delete = async <T>(args: ByIDArgs): Promise<T | null> => {
    if (args.collection === 'perfilMaker') return this.remover(this.mundo.perfis, args.id) as T | null
    if (args.collection === 'users') return this.remover(this.mundo.contas, args.id) as T | null
    // Modelled, so an implementation that DELETED the entries empties the table here instead of
    // no-opping through the content branch and reading as append-only.
    if (args.collection === 'xpLedger') return this.remover(this.mundo.xpLedger, args.id) as T | null
    return this.remover(this.linhas(args.collection), args.id) as T | null
  }

  private remover<T extends { id: number }>(rows: T[], id: string | number): T | null {
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) return null
    return rows.splice(i, 1)[0] ?? null
  }
}

const comLoja = (store: FakeDeletionStore) => ({
  getStore: async () => store,
})

describe('a apuração distingue — o fixture é um em que apagar as entradas mudaria o nível', () => {
  it('cai de nível quando as entradas da pessoa somem, e é por isso que o teste abaixo vale', () => {
    const todas = mundoPadrao().xpLedger
    const semAPessoa = todas.filter((e) => e.perfil !== PERFIL)

    expect(xpDoLab(todas)).toBe(15)
    expect(nivelDoLab(todas, REGRAS)).toBe(3)
    // O contrafactual: se a exclusão apagasse as linhas, o lab perderia um nível em público.
    expect(nivelDoLab(semAPessoa, REGRAS)).toBe(2)
  })
})

describe('excluir uma conta não mexe no Nível do Lab (SC-021, FR-012, CLR-011)', () => {
  it('mantém o XP total da organização — o crédito foi mesmo conquistado', async () => {
    const store = new FakeDeletionStore()
    const antes = nivelDoLab(store.mundo.xpLedger, REGRAS)

    await deleteAccount({ req: REQ, perfilId: PERFIL }, comLoja(store))

    expect(
      xpDoLab(store.mundo.xpLedger),
      'a exclusão mudou o XP total da organização. O Nível do Lab é uma projeção do ledger ' +
        'inteiro (FR-012): o total só pode mudar se alguma entrada sumiu ou foi zerada, e ' +
        'CLR-011 decidiu que a exclusão anula `perfil` e não toca em mais nada.',
    ).toBe(15)
    expect(
      nivelDoLab(store.mundo.xpLedger, REGRAS),
      'o Nível do Lab mudou porque alguém saiu. Ninguém pediu que o lab encolhesse: o trabalho ' +
        'ficou, só o nome saiu (CLR-011).',
    ).toBe(antes)
  })

  it('deixa as entradas da pessoa no ledger, sem nome e com a quantidade intacta', async () => {
    const store = new FakeDeletionStore()

    await deleteAccount({ req: REQ, perfilId: PERFIL }, comLoja(store))

    const anonimas = store.mundo.xpLedger.filter((e) => e.perfil === null)
    expect(
      anonimas.map((e) => e.id),
      'as entradas da pessoa não sobreviveram anônimas. Apagá-las reescreveria a história ' +
        '(FR-001) e derrubaria o Nível do Lab junto.',
    ).toEqual([101, 102])
    expect(anonimas.map((e) => e.quantidade)).toEqual(XP_DA_PESSOA)
    // O resto da linha é intocado: zerar a quantidade seria a outra forma de encolher o lab.
    expect(anonimas[0]).toMatchObject({
      acao: 'publicar_artigo',
      refTipo: 'artigo',
      refId: 31,
      chaveIdempotencia: '1:7:publicar_artigo:artigo:31',
    })
    // As dos outros não são tocadas.
    expect(store.mundo.xpLedger.filter((e) => e.perfil === PERFIL_ALHEIO)).toHaveLength(2)
  })

  it('não muda o nível de um lab cujo total está no teto, nem de um lab vazio', async () => {
    const mundo = mundoPadrao()
    // Bem acima do teto: o nível é `nivelMaximo` antes e depois, e a asserção só vale porque
    // `levelFor` satura — é onde uma perda de XP some sem mudar o número (CLR-013).
    mundo.xpLedger = [entrada(301, PERFIL, 40, 31), entrada(302, PERFIL_ALHEIO, 40, 41)]
    const store = new FakeDeletionStore(mundo)

    await deleteAccount({ req: REQ, perfilId: PERFIL }, comLoja(store))

    expect(nivelDoLab(store.mundo.xpLedger, REGRAS)).toBe(REGRAS.nivelMaximo)
    expect(xpDoLab(store.mundo.xpLedger)).toBe(80)

    // SC-014: um lab sem nenhuma entrada lê 0 — nunca em branco, nunca NaN.
    const vazio = mundoPadrao()
    vazio.xpLedger = []
    const semLedger = new FakeDeletionStore(vazio)
    await deleteAccount({ req: REQ, perfilId: PERFIL }, comLoja(semLedger))
    expect(nivelDoLab(semLedger.mundo.xpLedger, REGRAS)).toBe(0)
  })
})

/**
 * The second half of T011c: CLR-011 ends with *"`docs/lgpd.md` gains a row saying what deletion
 * does to XP"*, and it is not a formality. The record is what the lab answers a titular's
 * request out of, and it currently promises that an erasure removes the person's data and keeps
 * their published work. The ledger is a third thing — data *about* the person that survives
 * **under no name** — and a record that does not mention it is wrong in the direction that
 * matters: it under-reports what is kept.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const RECORD = join(ROOT, 'docs', 'lgpd.md')
/** Read defensively: a throw at module scope would make a missing document indistinguishable
 *  from a broken suite — `lgpd-doc.test.ts` records paying for that lesson. */
const DOC = existsSync(RECORD) ? readFileSync(RECORD, 'utf8') : ''

/** The collection slug, out of the config — so the record cannot name a table that was renamed. */
const SLUG_LEDGER = XpLedger.slug

/** The body of one `##` section, so a claim is asserted where it belongs and not anywhere at all. */
function secao(titulo: RegExp): string {
  const cabecalhos = [...DOC.matchAll(/^## .*$/gm)]
  const inicio = cabecalhos.find((h) => titulo.test(h[0]))
  if (!inicio) return ''
  const proximo = cabecalhos.find((h) => (h.index ?? 0) > (inicio.index ?? 0))
  return DOC.slice(inicio.index ?? 0, proximo?.index ?? DOC.length)
}

/**
 * The row of a markdown table whose cells mention `termo`, inside `corpo`.
 *
 * A whole-document search is not enough and the difference was measured in `lgpd-doc.test.ts`:
 * `xpLedger` appears in prose elsewhere the moment anyone writes about the economy, so the
 * table row — the record — could be deleted whole with a substring check still green.
 */
function linhaDaTabela(corpo: string, termo: string): string[] | null {
  for (const linha of corpo.split('\n')) {
    if (!linha.trim().startsWith('|')) continue
    const celulas = linha.split('|').slice(1, -1).map((c) => c.trim())
    if (celulas.some((c) => c.includes(termo))) return celulas
  }
  return null
}

const NUMERAIS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete']

describe('docs/lgpd.md registra o que a exclusão faz com o XP (CLR-011, FR-030)', () => {
  it('dá ao ledger uma linha na tabela de dados gerados pelo uso', () => {
    const linha = linhaDaTabela(secao(/Dados coletados/i), `\`${SLUG_LEDGER}\``)
    expect(
      linha,
      `a exclusão anula \`perfil\` em \`${SLUG_LEDGER}\` e deixa a entrada de pé, e a tabela ` +
        '§ Dados gerados pelo uso não tem linha para ela. Um registro que lista curtidas, ' +
        'progresso e autoria e cala sobre o XP subnotifica o que a plataforma guarda de uma ' +
        'pessoa depois que ela pede a exclusão.',
    ).not.toBeNull()

    const texto = (linha ?? []).join(' | ')
    expect(
      /anonimizad|an[ôo]nim/i.test(texto),
      'a linha do ledger não diz que a entrada é anonimizada. "Apagada" seria falso e ' +
        '"mantida" sozinha esconderia que o nome sai — CLR-011 é exatamente a diferença.',
    ).toBe(true)
    expect(
      /n[íi]vel do lab/i.test(texto),
      'a linha não diz que o Nível do Lab não muda. É a consequência pela qual CLR-011 foi ' +
        'decidida (FR-012) e a metade que surpreende quem lê: o XP de quem saiu continua ' +
        'contando para o lab.',
    ).toBe(true)
  })

  it('conta o XP entre os efeitos de § O que a exclusão faz', () => {
    const corpo = secao(/O que a exclusão faz/i)
    expect(corpo, 'não há seção § O que a exclusão faz').not.toBe('')
    expect(
      corpo.includes(`\`${SLUG_LEDGER}\``),
      `§ O que a exclusão faz não nomeia \`${SLUG_LEDGER}\`. A exclusão escreve nessa tabela ` +
        '(`anonimizarLedger`), e um efeito que o registro não lista é um efeito que ninguém ' +
        'confere quando ele mudar.',
    ).toBe(true)
  })

  it('mantém o numeral da seção igual ao número de efeitos listados', () => {
    const corpo = secao(/O que a exclusão faz/i)
    const efeitos = corpo.split('\n').filter((l) => /^\d+\. \*\*/.test(l)).length
    expect(efeitos, 'a seção deixou de enumerar os efeitos em lista numerada').toBeGreaterThan(0)

    const numeral = NUMERAIS[efeitos]
    expect(
      new RegExp(`os ${numeral} efeitos`, 'i').test(corpo),
      `a seção lista ${efeitos} efeitos e a frase da transação não diz "os ${numeral} efeitos". ` +
        'É uma frase sobre atomicidade: quando um efeito é acrescentado e o numeral fica para ' +
        'trás, o registro passa a prometer que menos coisas acontecem juntas do que acontecem.',
    ).toBe(true)
  })
})
