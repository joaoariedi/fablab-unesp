import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CardProjeto, type CardProjetoAutor } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T041 / FR-033, US10 — the author strip shows the maker's **real** level.
 *
 * `spec.md` FR-033: *"The author strip on cards and detail pages shows the maker's **real**
 * level, replacing the level-1 stand-in four pages document"*; US10: *"they credit that maker —
 * name, `@handle` and their real level — instead of the 'Fab Lab' placeholder four pages carry
 * today"*.
 *
 * ── The four placeholders, and what each one was ────────────────────────────────────────────
 *
 * They are not the same defect wearing four hats, which is why this file asserts four things
 * rather than scanning for one string:
 *
 *   - **Home and Projetos** credited the lab on *every* card — `AUTORIA_PENDENTE`, a literal
 *     `{ nome: 'Fab Lab', handle: 'fablab', nivel: 1 }` — because `projeto` carried no `autor`
 *     field at all until T039. Their own comments say *"Delete this the moment `autor` exists,
 *     here and there, in one change."*
 *   - **Artigos** read the real person and then overwrote their level with `NIVEL_PENDENTE = 1`,
 *     because `perfilMaker` had no `nivel` until T008. Its comment says *"Delete this the moment
 *     `nivel` exists and read it off the profile."*
 *   - **Aulas** drew no level at all, and recorded why: *"the only options were a number nobody
 *     earned on a public page or its absence"*. `aulas.md` § *Lista de aulas* draws
 *     `@handle` / `NÍVEL n` on the card, so the absence was the stand-in.
 *
 * ── Why two makers at different levels, and not one ─────────────────────────────────────────
 *
 * A single fixture cannot tell a page that reads `perfil.nivel` from one that swapped a `1` for
 * whatever number the fixture happened to carry — the level-1 stand-in passes a one-maker test
 * the moment the fixture is a level-1 maker. Two makers on the same page, at two levels, is the
 * cheapest assertion that only a real read satisfies.
 *
 * ── Why the sources are scanned as well as rendered ─────────────────────────────────────────
 *
 * §5 is an *inventory*, in the shape `page-stub-retired.test.ts` uses: the constants are named
 * in the tasks as things to delete, and a page that kept one alive on a branch the fixtures do
 * not reach would pass every rendering case above. Artigos keeps `AUTORIA_PENDENTE` on purpose
 * — it is that page's answer to a relationship that arrived as a bare id (T031, §4 of
 * `tombstone.test.ts`), not a level stand-in — so only `NIVEL_PENDENTE` is scanned for there.
 */

const FRONTEND = join(import.meta.dirname, '..', '..', 'app', '(frontend)')

const HOME_SOURCE = join(FRONTEND, 'page.tsx')
const PROJETOS_SOURCE = join(FRONTEND, 'projetos', 'page.tsx')
const ARTIGOS_SOURCE = join(FRONTEND, 'artigos', 'page.tsx')
const AULAS_SOURCE = join(FRONTEND, 'aulas', 'page.tsx')

/**
 * Every `page.tsx` under `app/(frontend)`, found by walking rather than listed.
 *
 * A list is what §6 exists to stop trusting: T041 enumerated four files and a fifth surface with
 * the same stand-in was left behind. `readdirSync` with `withFileTypes` is the tree itself, so a
 * route added later is scanned on the day it lands.
 */
function pagesUnder(dir: string): string[] {
  const encontradas: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) encontradas.push(...pagesUnder(caminho))
    else if (entrada.name === 'page.tsx') encontradas.push(caminho)
  }
  return encontradas
}

/** Two makers of this organization, at two levels the fixtures below never confuse. */
const MARIA = { id: 9, nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 }
const JOAO = { id: 11, nome: 'João Prado', handle: 'joaoprado', nivel: 2 }

const CATEGORIA_PROJETO = { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d' }
const CATEGORIA_ARTIGO = { id: 1, nome: 'Cultura Maker', slug: 'cultura-maker', ordem: 1 }

const projetoDe = (autor: unknown, n: number) => ({
  id: 10 + n,
  titulo: `Luminária ${n}`,
  slug: `luminaria-${n}`,
  descricaoCurta: 'Luminária decorativa impressa em 3D.',
  categoria: CATEGORIA_PROJETO,
  imagemCapa: { id: 3, url: '/media/lum.png', sizes: { card: { url: '/media/lum-card.png' } } },
  autor,
  curtidas: 32,
})

const artigoDe = (autor: unknown, n: number) => ({
  id: 20 + n,
  titulo: `Práticas colaborativas ${n}`,
  slug: `praticas-${n}`,
  resumo: 'Volume 1 da coleção Primeiros Passos.',
  categoria: CATEGORIA_ARTIGO,
  capa: { id: 5, url: '/media/praticas.png', sizes: { card: { url: '/media/praticas-card.png' } } },
  autor,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
  curtidas: 24,
})

const aulaDe = (autor: unknown, n: number) => ({
  id: 30 + n,
  titulo: `Primeiros passos ${n}`,
  slug: `primeiros-passos-${n}`,
  descricao: 'Aprenda os conceitos básicos da impressão 3D.',
  thumbnail: { id: 7, url: '/media/aula.png', sizes: { card: { url: '/media/aula-card.png' } } },
  videoUrl: 'https://videos.test/aula-01',
  duracaoMin: 25,
  autor,
  curtidas: 42,
  dataPublicacao: '2024-05-12T00:00:00.000Z',
})

/** The anonymous client the listings read their own category vocabulary through. */
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
   *  let a page fall through to a render the runtime never reaches. */
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

const { default: HomePage } = await import('../../app/(frontend)/page')
const { default: ProjetosPage } = await import('../../app/(frontend)/projetos/page')
const { default: ArtigosPage } = await import('../../app/(frontend)/artigos/page')
const { default: AulasPage } = await import('../../app/(frontend)/aulas/page')

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

/** The author of every `CardProjeto` on the page, in the order the page drew them. */
const autoresDosCards = (tree: ReactNode): CardProjetoAutor[] =>
  findAll(tree, CardProjeto).map((card) => card.props.autor as CardProjetoAutor)

/** Serves the listing reader, then calls the page. The Home takes no props; the three listings
 *  take `searchParams`, and both shapes tolerate the extra argument. */
async function renderPagina(
  page: (props: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>,
  docs: readonly Record<string, unknown>[],
  vocabulario: readonly Record<string, unknown>[] = [],
): Promise<ReactNode> {
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient(vocabulario))
  mocks.listPublic.mockResolvedValue({
    docs,
    page: 1,
    totalPages: 1,
    totalDocs: docs.length,
  })
  return (await page({ searchParams: Promise.resolve({}) })) as ReactNode
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the Home carousel credits the project\'s maker, at their own level', () => {
  it('reads name, handle and level off the populated profile', async () => {
    const tree = await renderPagina(HomePage, [projetoDe(MARIA, 1)])

    expect(
      autoresDosCards(tree)[0],
      'the Home carousel is still handing the card a constant. `projeto.autor` exists since ' +
        'T039 and arrives populated at depth 1, so the strip must read that profile — the ' +
        '`AUTORIA_PENDENTE` lab byline credited an organization for work it did not make, and ' +
        'its level 1 was a number nobody earned (FR-033, US10).',
    ).toEqual({ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 })
  })

  it('gives each card its own maker\'s level, not one level for the page', async () => {
    const tree = await renderPagina(HomePage, [projetoDe(MARIA, 1), projetoDe(JOAO, 2)])

    expect(autoresDosCards(tree).map((autor) => ('removido' in autor ? null : autor.nivel))).toEqual([7, 2])
  })

  it('renders the tombstone for a project whose author was erased (US10 edge)', async () => {
    // `projeto.autor` is nullable by design (FR-034) and the field's own description says an
    // empty one is *"um autor que pediu exclusão"* — so `null` is FR-031's erased maker, never
    // a byline the page is free to invent (US10 error case).
    const tree = await renderPagina(HomePage, [projetoDe(null, 1)])

    expect(autoresDosCards(tree)[0]).toEqual({ removido: true })
  })
})

describe('§2 — the Projetos listing credits the same way', () => {
  it('reads name, handle and level off the populated profile', async () => {
    const tree = await renderPagina(ProjetosPage, [projetoDe(MARIA, 1)], [CATEGORIA_PROJETO])

    expect(
      autoresDosCards(tree)[0],
      'the Projetos listing is still handing the card `AUTORIA_PENDENTE`. The constant\'s own ' +
        'comment says to delete it the moment `autor` exists — T039 landed it (FR-033, US10).',
    ).toEqual({ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 })
  })

  it('gives each card its own maker\'s level', async () => {
    const tree = await renderPagina(
      ProjetosPage,
      [projetoDe(MARIA, 1), projetoDe(JOAO, 2)],
      [CATEGORIA_PROJETO],
    )

    expect(autoresDosCards(tree).map((autor) => ('removido' in autor ? null : autor.nivel))).toEqual([7, 2])
  })

  it('renders the tombstone for a project whose author was erased (US10 edge)', async () => {
    const tree = await renderPagina(ProjetosPage, [projetoDe(null, 1)], [CATEGORIA_PROJETO])

    expect(autoresDosCards(tree)[0]).toEqual({ removido: true })
  })
})

describe('§3 — the Artigos listing stops overwriting the level with 1', () => {
  it('shows the level the profile carries', async () => {
    const tree = await renderPagina(ArtigosPage, [artigoDe(MARIA, 1)], [CATEGORIA_ARTIGO])

    expect(
      autoresDosCards(tree)[0],
      'the Artigos listing still prints `NIVEL_PENDENTE`. It reads the real name and handle and ' +
        'then replaces the level with 1 — `perfilMaker.nivel` exists since T008, and FR-033 ' +
        'asks for the real one.',
    ).toEqual({ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 })
  })

  it('gives each card its own maker\'s level', async () => {
    const tree = await renderPagina(
      ArtigosPage,
      [artigoDe(MARIA, 1), artigoDe(JOAO, 2)],
      [CATEGORIA_ARTIGO],
    )

    expect(autoresDosCards(tree).map((autor) => ('removido' in autor ? null : autor.nivel))).toEqual([7, 2])
  })
})

describe('§4 — the Aulas byline draws the level it was missing', () => {
  it('prints `NÍVEL n` beside the handle (aulas.md § Lista de aulas)', async () => {
    const texto = textOf(await renderPagina(AulasPage, [aulaDe(MARIA, 1)]))

    expect(texto).toContain('Maria Silva')
    expect(
      texto,
      'the Aulas card draws no level. Its comment recorded the absence as a stand-in — *"the ' +
        'only options were a number nobody earned on a public page or its absence"* — and ' +
        '`perfilMaker.nivel` is now the third option FR-033 asks for.',
    ).toContain('NÍVEL 7')
  })

  it('gives each card its own maker\'s level', async () => {
    const texto = textOf(await renderPagina(AulasPage, [aulaDe(MARIA, 1), aulaDe(JOAO, 2)]))

    expect(texto).toContain('NÍVEL 7')
    expect(texto).toContain('NÍVEL 2')
  })
})

describe('§5 — the placeholders are gone from the sources that documented them', () => {
  // The *declaration*, not the word: the comments that replaced these constants name them, and
  // deleting the explanation of why a placeholder went is how the placeholder comes back.
  it.each([
    ['Home', 'AUTORIA_PENDENTE', HOME_SOURCE],
    ['Projetos', 'AUTORIA_PENDENTE', PROJETOS_SOURCE],
    ['Artigos', 'NIVEL_PENDENTE', ARTIGOS_SOURCE],
  ])('%s no longer declares %s', (_pagina, constante, source) => {
    expect(
      readFileSync(source, 'utf8'),
      `this page still declares ${constante}. Every case above can pass with the constant left ` +
        'standing on a branch the fixtures do not reach, and the four comments say to delete ' +
        'them in ONE change — a survivor is a placeholder waiting to be handed to a card again.',
    ).not.toContain(`const ${constante}`)
  })

  it('Aulas no longer records the level as deferred to feature 005', () => {
    expect(
      readFileSync(AULAS_SOURCE, 'utf8'),
      'the Aulas page still says `perfilMaker` carries no `nivel` until feature 005. It does ' +
        'now (T008), and a comment that says otherwise is the instruction the next reader follows.',
    ).not.toContain('carries no `nivel` until feature 005')
  })
})

/**
 * §6 — **the rule, asked of the tree rather than of a list of four files.**
 *
 * T041's inventory named four pages, its test asserted those four, and a **fifth** card surface
 * with the identical deferral comment was left behind: `biblioteca-3d/page.tsx` still read
 * *"No level — `perfilMaker` carries none"*, a sentence that stopped being true at T008. The
 * same maker would have shown `NÍVEL 7` on an Aulas card and no level at all one route over.
 * The three detail bylines were in the same position, and FR-033 says *"on cards **and detail
 * pages**"*.
 *
 * So this section does not enumerate. It asks which files render an author strip — the tombstone
 * import is what makes a file one, since `AUTOR_REMOVIDO` exists for exactly that byline — and
 * requires every one of them to print the level. A sixth surface added next year is covered on
 * the day it imports the tombstone, which is the day it becomes an author strip.
 */
describe('§6 — every author strip in the tree shows the level (FR-033)', () => {
  const PAGINAS_COM_AUTORIA = pagesUnder(FRONTEND).filter((arquivo) =>
    readFileSync(arquivo, 'utf8').includes('AUTOR_REMOVIDO'),
  )

  it('finds the author strips at all, so the rule below is not scanning an empty list', () => {
    expect(
      PAGINAS_COM_AUTORIA.length,
      'no page imports AUTOR_REMOVIDO, so either the tombstone moved or this scan is looking ' +
        'in the wrong place — and every assertion below would pass by checking nothing',
    ).toBeGreaterThanOrEqual(4)
  })

  it.each(PAGINAS_COM_AUTORIA)('%s prints the maker\'s level', (arquivo) => {
    expect(
      readFileSync(arquivo, 'utf8'),
      `this page renders an author strip — it imports the tombstone — and never prints ` +
        `NÍVEL. FR-033 is one rule for cards and detail pages both, and a byline that shows ` +
        `the level on one route and not on another is the drift 004 kept these hand-drawn ` +
        `strips in step to avoid.`,
    ).toContain('NÍVEL ${perfil.nivel')
  })

  it('no page still records the level as something perfilMaker does not carry', () => {
    // The stand-in's own opening sentence, not the clause inside it: the pages that were
    // repaired QUOTE the old wording while explaining why it is false, and a scan for the quote
    // would flag the explanation as the defect it documents.
    const mentirosas = PAGINAS_COM_AUTORIA.filter((arquivo) =>
      readFileSync(arquivo, 'utf8').includes('No level —'),
    )
    expect(
      mentirosas,
      'a page still says `perfilMaker` carries no level. It does (T008), and a comment that ' +
        'says otherwise is the instruction the next reader follows — which is exactly how the ' +
        'fifth surface came to be left out of the four this feature enumerated.',
    ).toEqual([])
  })
})
