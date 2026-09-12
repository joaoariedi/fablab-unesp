import type { PayloadRequest } from 'payload'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTOR_REMOVIDO, CardProjeto } from '@fablab/ui'

import { deleteAccount, type DeletionStore } from '../../lib/accounts/deletion'
import type { ByIDArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T033 / SC-010, US8 — **the three halves, proven where a reader can see them**.
 *
 * SC-010 is measured by *"a test asserting all three, including a card rendering the
 * tombstone"*, and T033 adds the counters to that sentence. Each of the three already has a
 * test of its own, and none of them proves this:
 *
 *   - `delete-account.test.ts` (T032) drives `deleteAccount` against a fake world and asserts
 *     the rows it leaves behind — but a row is not what the person who asked for the erasure
 *     reads;
 *   - `tombstone.test.ts` (T031) renders every page over a **hand-written** `autor: null` — a
 *     fixture that says nothing about whether deletion ever produces that value;
 *   - `counters.test.ts` reconciles stored counters against their source rows, offline from any
 *     page.
 *
 * So the seam between them is what this file owns: the `null` the listing renders here is the
 * one `deleteAccount` wrote, and the number the card prints is the one `syncCounter` recomputed
 * during the erasure. **One world, mutated by the real module, then handed to the real pages.**
 * Nothing below re-authors a document between the two halves; a test that did would be asserting
 * its own fixture and would keep passing after the erasure stopped writing anything.
 *
 * ── Why the counter is watched on a card and not only in the row ───────────────────────────
 *
 * `projeto 5` stores **9** while three `curtida` rows point at it, one of them this person's.
 * Three numbers are therefore distinguishable on the rendered card: `9` (nothing recounted),
 * `8` (a decrement from a stale stored value — the drift `counters.ts` exists to refuse), and
 * `2` (the recount from the rows that remain). Only the last is *"counters recomputed"*, and
 * the visitor meets it as the number inside the heart.
 *
 * ── Why a named fake and not Postgres ──────────────────────────────────────────────────────
 *
 * The drift above is a state a healthy database will not hold still in, and it is the only
 * state in which a decrement and a recount disagree. The pages are read through the same
 * mocking seam `tombstone.test.ts` uses, so what is being joined here is the two modules'
 * agreement about the data, not a database round trip.
 *
 * ── Watched failing, because a gate written after the code proves nothing on its own ───────
 *
 * Every half below was observed red against a planted violation of `deletion.ts`, with the
 * anchor asserted to have applied first — phase 4's lesson, recorded in `tasks.md`: *"a
 * mutation that mutates nothing reports success on a tree it never touched"*. What each plant
 * broke, and which section caught it:
 *
 *   - `autor` left populated instead of nulled → §1 and §2; the rendered card printed
 *     `Maria Silva` and `@mariasilva` after the erasure;
 *   - the content `delete`d along with its author (CLR-003's cascade) → §2 only;
 *   - `derive: { kind: 'delta', by: -1 }` instead of the recount → §3 only; the card printed
 *     `8 curtidas`, the stale column minus one;
 *   - the `perfilMaker` delete removed → §1 only.
 *
 * Each plant reddened exactly the half it violates and left the others green, which is what
 * makes the three sections separable evidence rather than one assertion in three places.
 */

const LAB = 'org-bauru'

/** The person being erased, and the account their likes hang off. */
const PERFIL = 7
const CONTA = 42
/** Two other people, whose likes are the control: the recount must keep exactly these. */
const OUTRA_CONTA = 98
const TERCEIRA_CONTA = 99

/** The personal data the erasure promises to remove — asserted absent from the rendered card. */
const NOME = 'Maria Silva'
const HANDLE = 'mariasilva'

const ARTIGO_ID = 3
const PROJETO_ID = 5

/** The tab vocabularies the two listings read. Constants rather than a field of the row being
 *  erased: a fixture derived from the document under test collapses into a `TypeError` on the
 *  day deletion wrongly removes it, and a crash is not the assertion this file is making. */
const CATEGORIA_ARTIGO = { id: 1, nome: 'Cultura Maker', slug: 'cultura-maker', ordem: 1 }
const CATEGORIA_PROJETO = { id: 2, nome: 'Impressão 3D', slug: 'impressao-3d' }

/**
 * `projeto 5`'s stored counter, deliberately ahead of its rows. Reachable in production for the
 * reasons `counters.test.ts` lists — an admin bulk delete, a migration, a manual SQL fix.
 */
const ARMAZENADO_DESATUALIZADO = 9
/** What a decrement would print, and what a recount must not. */
const DECREMENTO_INGENUO = ARMAZENADO_DESATUALIZADO - 1
/** The two likes that survive the erasure. */
const RECONTAGEM = 2

const REQ = { id: 'req-t033', user: { id: CONTA } } as unknown as PayloadRequest

type LinhaCurtida = {
  id: number
  usuario: number
  conteudo: { relationTo: string; value: number }
}
type LinhaPerfil = { id: number; usuario: number; nome: string; handle: string }
type LinhaConta = { id: number; orgs: { organization: string }[] }
/** A content row as the listing reads it: presentation fields **and** the two the erasure
 *  touches, on the same object, so the page renders exactly what the module wrote. */
type LinhaConteudo = Record<string, unknown> & { id: number; curtidas: number }

type Mundo = {
  perfis: LinhaPerfil[]
  curtidas: LinhaCurtida[]
  conteudos: Record<string, LinhaConteudo[]>
  contas: LinhaConta[]
}

const curtida = (id: number, usuario: number, value: number): LinhaCurtida => ({
  id,
  usuario,
  conteudo: { relationTo: 'projeto', value },
})

/** The article this maker wrote — the row CLR-003 promises stays up. */
const artigoDaMaker = (): LinhaConteudo => ({
  id: ARTIGO_ID,
  titulo: 'Práticas colaborativas em oficina',
  slug: 'praticas-colaborativas',
  resumo: 'Volume 1 da coleção Primeiros Passos.',
  categoria: CATEGORIA_ARTIGO,
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor: { id: PERFIL, nome: NOME, handle: HANDLE, nivel: 7 },
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  corpo: null,
  anexos: [],
  curtidas: 0,
})

/** Somebody else's project, which this maker liked — where the counter is watched. */
const projetoCurtido = (): LinhaConteudo => ({
  id: PROJETO_ID,
  titulo: 'Luminária paramétrica',
  slug: 'luminaria-parametrica',
  descricaoCurta: 'Luminária decorativa impressa em 3D.',
  categoria: CATEGORIA_PROJETO,
  imagemCapa: { url: '/media/luminaria.png', sizes: { card: { url: '/media/luminaria-card.png' } } },
  curtidas: ARMAZENADO_DESATUALIZADO,
})

const mundoPadrao = (): Mundo => ({
  perfis: [{ id: PERFIL, usuario: CONTA, nome: NOME, handle: HANDLE }],
  curtidas: [
    curtida(1, CONTA, PROJETO_ID),
    curtida(2, OUTRA_CONTA, PROJETO_ID),
    curtida(3, TERCEIRA_CONTA, PROJETO_ID),
  ],
  conteudos: {
    artigo: [artigoDaMaker()],
    aula: [],
    modelo3d: [],
    projeto: [projetoCurtido()],
  },
  contas: [{ id: CONTA, orgs: [{ organization: LAB }] }],
})

/** A relationship arrives as an id or as a populated document — both mean the same row. */
const idDe = (ref: unknown): unknown =>
  typeof ref === 'object' && ref !== null ? (ref as { id?: unknown }).id : ref

const igual = (where: unknown, campo: string): unknown =>
  (where as Record<string, { equals?: unknown }> | undefined)?.[campo]?.equals

/**
 * The choke-point client, holding a **real world**: every delete and update mutates the rows the
 * pages later render, so the recount is a recount and not a number the fake was told to say.
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
    if (args.collection === 'curtida') {
      const usuario = igual(args.where, 'usuario')
      const alvo = igual(args.where, 'conteudo.value')
      return this.mundo.curtidas.filter(
        (l) =>
          (usuario === undefined || l.usuario === usuario) &&
          (alvo === undefined || l.conteudo.value === alvo),
      )
    }
    if (args.collection === 'perfilMaker') {
      const usuario = igual(args.where, 'usuario')
      return this.mundo.perfis.filter((p) => usuario === undefined || p.usuario === usuario)
    }
    const autor = igual(args.where, 'autor')
    return this.linhas(args.collection).filter((c) => autor === undefined || idDe(c.autor) === autor)
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
    const alvo = this.linhas(args.collection).find((c) => c.id === args.id)
    if (!alvo) return null
    Object.assign(alvo, args.data)
    return alvo as T
  }

  delete = async <T>(args: ByIDArgs): Promise<T | null> => {
    if (args.collection === 'curtida') return this.remover(this.mundo.curtidas, args.id) as T | null
    if (args.collection === 'perfilMaker') {
      return this.remover(this.mundo.perfis, args.id) as T | null
    }
    if (args.collection === 'users') return this.remover(this.mundo.contas, args.id) as T | null
    return this.remover(this.linhas(args.collection), args.id) as T | null
  }

  private remover<T extends { id: number }>(rows: T[], id: string | number): T | null {
    const i = rows.findIndex((r) => r.id === id)
    if (i < 0) return null
    return rows.splice(i, 1)[0] ?? null
  }
}

/** The anonymous client the listings read their category vocabulary through. */
class FakePublicClient {
  readonly tenantId = 'org-fake'

  constructor(private readonly docs: readonly Record<string, unknown>[] = []) {}

  find = async <T>(): Promise<{ docs: T[]; totalDocs: number }> => ({
    docs: this.docs as T[],
    totalDocs: this.docs.length,
  })

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  }),
  getPublicScopedPayloadForRSC: vi.fn(),
  listPublic: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

vi.mock('../../lib/public/listing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/public/listing')>()),
  listPublic: mocks.listPublic,
}))

const { default: ArtigosPage } = await import('../../app/(frontend)/artigos/page')
const { default: ProjetosPage } = await import('../../app/(frontend)/projetos/page')

type AnyElement = ReactElement<{ readonly children?: ReactNode; readonly [key: string]: unknown }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

type ListingPageFn = (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>

/** Renders a listing over one row **of the world**, with the vocabulary its tabs read. */
async function renderListagem(
  page: ListingPageFn,
  doc: Record<string, unknown>,
  vocabulario: readonly Record<string, unknown>[] = [],
): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient(vocabulario))
  mocks.listPublic.mockResolvedValue({ docs: [doc], page: 1, totalPages: 1, totalDocs: 1 })
  return (await page({ searchParams: Promise.resolve({}) })) as ReactNode
}

/**
 * The card's own markup.
 *
 * A card reached through a page tree is an **unexpanded** element: every word it will print
 * still lives in props, so the only way to assert what a visitor reads is to render it.
 */
const markupDoCard = (tree: ReactNode): string => {
  const card = findAll(tree, CardProjeto)[0]
  return card === undefined ? '' : renderToStaticMarkup(card)
}

const linha = (mundo: Mundo, collection: string, id: number): LinhaConteudo | undefined =>
  (mundo.conteudos[collection] ?? []).find((c) => c.id === id)

/** Runs the real erasure over a fresh world and hands the world back for rendering. */
async function excluir(): Promise<FakeDeletionStore> {
  const store = new FakeDeletionStore()
  await deleteAccount({ req: REQ, perfilId: PERFIL }, { getStore: async () => store })
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SC-010 §1 — os dados pessoais somem, inclusive da página', () => {
  it('apaga o perfil e não deixa nome nem @handle no card que sobrou', async () => {
    const store = await excluir()

    expect(store.mundo.perfis, 'the perfilMaker row is the personal data — it must be gone').toEqual(
      [],
    )

    const artigo = linha(store.mundo, 'artigo', ARTIGO_ID)
    const markup = markupDoCard(await renderListagem(ArtigosPage, artigo ?? {}, [CATEGORIA_ARTIGO]))

    // The last surface the erasure has to hold on: a byline still printing the name would undo
    // the deletion where it is actually read, whatever the row says.
    expect(markup).not.toContain(NOME)
    expect(markup).not.toContain(HANDLE)
  })
})

describe('SC-010 §2 — o trabalho publicado fica de pé, com a lápide', () => {
  it('mantém o artigo e o card renderiza a lápide, sem creditar o lab', async () => {
    const store = await excluir()

    const artigo = linha(store.mundo, 'artigo', ARTIGO_ID)
    expect(
      artigo?.titulo,
      'CLR-003 keeps the published work up: deleting the article with its author would take ' +
        'down teaching material the lab depends on',
    ).toBe('Práticas colaborativas em oficina')
    expect(artigo?.autor, 'authorship is nulled, not the document').toBeNull()

    const markup = markupDoCard(await renderListagem(ArtigosPage, artigo ?? {}, [CATEGORIA_ARTIGO]))

    expect(
      markup,
      'the `null` rendered here is the one deleteAccount wrote, not a fixture: this is the ' +
        'seam SC-010 measures — an erasure whose result a page can actually draw',
    ).toContain(AUTOR_REMOVIDO)
    // Re-attributing a deleted maker's article to the organization is worse than dropping the
    // credit: it names an author who did not write it.
    expect(markup).not.toContain('@fablab')
  })
})

describe('SC-010 §3 — as curtidas somem e o contador é RECONTADO, não decrementado', () => {
  it('o card imprime a recontagem das linhas restantes', async () => {
    const store = await excluir()

    expect(
      store.mundo.curtidas.map((l) => l.usuario),
      'a like is an act by a person, not a contribution — only this person\'s rows go',
    ).toEqual([OUTRA_CONTA, TERCEIRA_CONTA])

    const projeto = linha(store.mundo, 'projeto', PROJETO_ID)
    const markup = markupDoCard(await renderListagem(ProjetosPage, projeto ?? {}, [CATEGORIA_PROJETO]))

    // The card first, because that is the form SC-010 measures the counter in: the number
    // inside the heart, which `LikeButton` also prints as its accessible name, so this is
    // literally what a visitor reads and what a screen reader announces.
    expect(
      markup,
      `stored ${ARMAZENADO_DESATUALIZADO}, three rows, one of them this person's: a decrement ` +
        `prints ${DECREMENTO_INGENUO} on the card and carries the drift forward, and no ` +
        `recount at all prints ${ARMAZENADO_DESATUALIZADO}. FR-031 says recomputed.`,
    ).toContain(`${RECONTAGEM} curtidas`)
    expect(markup).not.toContain(`${DECREMENTO_INGENUO} curtidas`)
    expect(markup).not.toContain(`${ARMAZENADO_DESATUALIZADO} curtidas`)

    // And the row behind it, so a card that happened to print the right number off a stale
    // column would still be caught.
    expect(projeto?.curtidas).toBe(RECONTAGEM)
  })
})
