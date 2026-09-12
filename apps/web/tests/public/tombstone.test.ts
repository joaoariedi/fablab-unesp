import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTOR_REMOVIDO, CardProjeto, type CardProjetoAutor } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T031 / FR-031, CLR-003 — every page that passes an author renders the tombstone.
 *
 * T029 drops `NOT NULL` from `autor` on `artigo`, `aula` and `modelo3d`, and T030 made
 * `CardProjetoAutor` a union so a card can draw the state that column now permits. This is the
 * third step of the order `plan.md` § *Prioridades* fixes — *"migration, then `CardProjetoAutor`,
 * then the pages … so a nullable column never exists without a component that can draw it"* —
 * and it is the step a visitor can actually see.
 *
 * ── What a missing author used to mean, and why that is now the bug ─────────────────────────
 *
 * Every one of these pages was written against a **required** `autor`, so each treated an
 * absent profile as a *populate failure* and invented a fallback:
 *
 *   - the Artigos listing credited the lab (`Fab Lab`, `@fablab`) — a byline naming an
 *     organization that did not write the article;
 *   - the Aulas and Biblioteca 3D listings and the two detail pages returned `null` — the
 *     byline silently vanished.
 *
 * After the migration, `autor: null` is a **person who deleted their account**, and CLR-003
 * promises their work stays up *"with authorship replaced by a tombstone"*. Both old answers
 * break that promise in the same way: neither tells the reader that the work belongs to
 * somebody who is gone. Crediting the lab is the worse of the two, because it re-attributes
 * the work rather than merely dropping the credit.
 *
 * ── Why the wording is asserted against the export, not against a string ────────────────────
 *
 * CHK066 adjudicates that the tombstone is worded **once**. Four of these five pages draw their
 * own byline and cannot reach the wording through `CardProjeto`, so §3 scans their sources for
 * a hard-coded copy: a page that spelled it out would pass every rendering assertion here and
 * still be the second wording the checklist forbids.
 */

const FRONTEND = join(import.meta.dirname, '..', '..', 'app', '(frontend)')

/** Each page that credits an author, with the source §3 scans. */
const PAGE_SOURCES = {
  'artigos (listagem)': join(FRONTEND, 'artigos', 'page.tsx'),
  'artigos/[slug]': join(FRONTEND, 'artigos', '[slug]', 'page.tsx'),
  'aulas (listagem)': join(FRONTEND, 'aulas', 'page.tsx'),
  'biblioteca-3d (listagem)': join(FRONTEND, 'biblioteca-3d', 'page.tsx'),
  'biblioteca-3d/[slug]': join(FRONTEND, 'biblioteca-3d', '[slug]', 'page.tsx'),
} as const

/** The live profile every fixture starts from — the state that must keep rendering unchanged. */
const PERFIL = { id: 9, nome: 'Maria Silva', handle: 'mariasilva' }

const CATEGORIAS_ARTIGO = [{ id: 1, nome: 'Cultura Maker', slug: 'cultura-maker', ordem: 1 }]
const CATEGORIAS_MODELO = [{ id: 1, nome: 'Animais', slug: 'animais', totalModelos: 4, ordem: 1 }]

const ARTIGO = {
  id: 20,
  titulo: 'Práticas colaborativas em oficina',
  slug: 'praticas-colaborativas',
  resumo: 'Volume 1 da coleção Primeiros Passos.',
  categoria: CATEGORIAS_ARTIGO[0],
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor: PERFIL,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  corpo: null,
  anexos: [],
  curtidas: 24,
}

const AULA = {
  id: 30,
  titulo: 'Primeiros passos impressão 3D',
  slug: 'primeiros-passos-impressao-3d',
  descricao: 'Aprenda os conceitos básicos da impressão 3D.',
  thumbnail: { id: 7, url: '/media/aula.png', sizes: { card: { url: '/media/aula-card.png' } } },
  videoUrl: 'https://videos.test/aula-01',
  duracaoMin: 25,
  autor: PERFIL,
  curtidas: 42,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
}

const MODELO = {
  id: 10,
  titulo: 'Bolsa vazada',
  slug: 'bolsa-vazada',
  descricaoCurta: 'Bolsa decorativa com estrutura vazada.',
  categoria: CATEGORIAS_MODELO[0],
  thumbnail: { id: 3, url: '/media/bolsa.png', sizes: { card: { url: '/media/bolsa-card.png' } } },
  autor: PERFIL,
  arquivosModelo: [{ relationTo: 'midiaModelo3d', value: { id: 7, filename: 'bolsa.stl' } }],
  nivelDificuldade: 'iniciante',
  curtidas: 42,
}

/** The anonymous client the pages read their own vocabulary through. */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly docs: readonly Record<string, unknown>[] = []) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    return { docs: this.docs as T[], totalDocs: this.docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. A mock that returned would
   *  let a detail page fall through to a render the runtime never reaches. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
    listPublic: vi.fn(),
  }
})

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
const { default: ArtigoDetalhe } = await import('../../app/(frontend)/artigos/[slug]/page')
const { default: AulasPage } = await import('../../app/(frontend)/aulas/page')
const { default: BibliotecaPage } = await import('../../app/(frontend)/biblioteca-3d/page')
const { default: ModeloDetalhe } = await import('../../app/(frontend)/biblioteca-3d/[slug]/page')

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every string in the tree, joined — what a reader would see, ignoring the markup around it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isElement(node)) return ''
  return textOf((node.props.children ?? null) as ReactNode)
}

/** One document with its author replaced — `null` is what deletion leaves behind, and a bare
 *  id is the unrelated failure §4 keeps distinct from it. */
const comAutor = (doc: Record<string, unknown>, autor: unknown): Record<string, unknown> => ({
  ...doc,
  autor,
})

/** Renders a listing page over one document, with the vocabulary its sidebar or tabs read. */
async function renderListagem(
  page: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>,
  doc: Record<string, unknown>,
  vocabulario: readonly Record<string, unknown>[] = [],
): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient(vocabulario))
  mocks.listPublic.mockResolvedValue({ docs: [doc], page: 1, totalPages: 1, totalDocs: 1 })
  return (await page({ searchParams: Promise.resolve({}) })) as ReactNode
}

/** Renders a detail page over the one document its slug read finds. */
async function renderDetalhe(
  page: (props: { params: Promise<{ slug: string }> }) => Promise<unknown>,
  doc: Record<string, unknown>,
): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient([doc]))
  return (await page({ params: Promise.resolve({ slug: String(doc.slug) }) })) as ReactNode
}

/** The author the Artigos listing handed the card — the only page here that draws one. */
const autorDoCard = (tree: ReactNode): CardProjetoAutor | undefined =>
  findAll(tree, CardProjeto)[0]?.props.autor as CardProjetoAutor | undefined

/**
 * The card's own markup, rendered.
 *
 * `textOf` walks children and a card reached through a page tree has none yet — it is an
 * unexpanded element, and every string it will eventually print lives in props. So the words a
 * visitor reads on a card are only assertable by rendering it, which is also what proves the
 * page and `CardProjeto` agree about the union rather than merely agreeing about a prop name.
 */
const markupDoCard = (tree: ReactNode): string => {
  const card = findAll(tree, CardProjeto)[0]
  if (card === undefined) return ''
  return renderToStaticMarkup(card)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the card listing: a deleted author reaches the card as the removed state', () => {
  it('passes `{ removido: true }` when the article carries no author', async () => {
    const tree = await renderListagem(ArtigosPage, comAutor(ARTIGO, null), CATEGORIAS_ARTIGO)

    expect(
      autorDoCard(tree),
      'the Artigos listing handed the card a profile for an author that is `null`. After T029 ' +
        'that column is nullable and `null` means the person deleted their account (CLR-003), ' +
        'so the only honest value is the union\'s removed member.',
    ).toEqual({ removido: true })
  })

  it('does not credit the lab for work whose author deleted their account', async () => {
    const tree = await renderListagem(ArtigosPage, comAutor(ARTIGO, null), CATEGORIAS_ARTIGO)
    const markup = markupDoCard(tree)

    // The pre-T031 fallback, named by its handle rather than its display name: `@fablab` can
    // only have come from `AUTORIA_PENDENTE`, whereas the words "Fab Lab" are ordinary content
    // that a title or a summary may legitimately contain. Re-attributing a deleted maker's
    // article to the organization is worse than dropping the byline — it names an author who
    // did not write it.
    expect(markup).not.toContain('@fablab')
    expect(markup).toContain(AUTOR_REMOVIDO)
  })
})

describe('§2 — the four hand-drawn bylines render the same tombstone', () => {
  it('the Artigos detail page', async () => {
    const tree = await renderDetalhe(ArtigoDetalhe, comAutor(ARTIGO, null))
    expect(textOf(tree)).toContain(AUTOR_REMOVIDO)
  })

  it('the Aulas listing', async () => {
    const tree = await renderListagem(AulasPage, comAutor(AULA, null))
    expect(textOf(tree)).toContain(AUTOR_REMOVIDO)
  })

  it('the Biblioteca 3D listing', async () => {
    const tree = await renderListagem(BibliotecaPage, comAutor(MODELO, null), CATEGORIAS_MODELO)
    expect(textOf(tree)).toContain(AUTOR_REMOVIDO)
  })

  it('the Biblioteca 3D detail page', async () => {
    const tree = await renderDetalhe(ModeloDetalhe, comAutor(MODELO, null))
    expect(textOf(tree)).toContain(AUTOR_REMOVIDO)
  })
})

describe('§3 — the tombstone is worded once (CHK066)', () => {
  it.each(Object.entries(PAGE_SOURCES))('%s imports the wording rather than spelling it', (_, source) => {
    expect(
      readFileSync(source, 'utf8'),
      'this page hard-codes the tombstone wording. CHK066 adjudicates that it is worded ONCE — ' +
        '`AUTOR_REMOVIDO` in `@fablab/ui` — so that five pages cannot drift into five phrasings; ' +
        'a literal here passes every rendering assertion above and still breaks that.',
    ).not.toContain(AUTOR_REMOVIDO)
  })
})

describe('§4 — the tombstone keys on a deleted author, and nothing else', () => {
  it('still renders the maker when the profile is there', async () => {
    const tree = await renderListagem(ArtigosPage, ARTIGO, CATEGORIAS_ARTIGO)

    expect(autorDoCard(tree)).toEqual({ nome: 'Maria Silva', handle: 'mariasilva', nivel: 1 })
    expect(markupDoCard(tree)).toContain('Maria Silva')
    expect(markupDoCard(tree)).not.toContain(AUTOR_REMOVIDO)
  })

  it('does not read an unpopulated relationship as a deletion', async () => {
    // A bare id means `depth` did not populate the profile — the row still points at a living
    // maker. Printing the tombstone for it would tell a reader that somebody deleted an account
    // nobody deleted, and it would do so for every article on the page at once.
    const tree = await renderListagem(ArtigosPage, comAutor(ARTIGO, PERFIL.id), CATEGORIAS_ARTIGO)

    expect(markupDoCard(tree)).not.toContain(AUTOR_REMOVIDO)
  })
})
