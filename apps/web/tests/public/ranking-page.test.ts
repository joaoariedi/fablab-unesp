import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, PixelImage, formatHandle } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'
import { publicListReason } from '../../lib/tenancy/scope-registry'

/**
 * T043 / FR-013, FR-037, US6 — `/ranking`: this lab's makers by XP, **with the tie-break
 * declared**.
 *
 * ── Why the fake SORTS instead of returning its rows in fixture order ───────────────────────
 *
 * FR-013's whole content is the *order*, and a fake that answered every read with the same
 * array would make it unfalsifiable: a page that passed no `sort` at all would render exactly
 * what a page that passed `-xpTotal,handle` renders, and this suite would be green over a
 * screen whose order is whatever Postgres felt like returning. So `FakeLabClient` applies the
 * `sort` string it is given — and applies **nothing** when none is given, which is the database's
 * actual behaviour and the failure this task exists to prevent.
 *
 * The fixture is therefore stored in an order that is *not* the ranked one, and the two makers
 * tied at 12 XP are stored with the alphabetically **later** handle first — `carladias` ahead of
 * `brunoalves`. A page sorting by `-xpTotal` alone still passes §2's "highest first" and fails
 * on the tie, because a stable sort leaves that pair exactly as it found it. Which is precisely
 * the defect tasks.md names: *"sorting by XP alone leaves ties in whatever order Postgres
 * returns, which differs between runs and makes SC-013 unprovable"*.
 *
 * ── Why the order is read out of the rendered TEXT ──────────────────────────────────────────
 *
 * The requirement is about what a visitor reads, not about which array the page held. Reading
 * the handles back in the order they appear in the tree asserts the rendered order, so a page
 * that sorted correctly and then rendered from an unsorted copy is still caught.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * The instrument every page suite here uses (CLR-003 keeps the stack at Vitest with no DOM):
 * the page is awaited as the async function it is and the returned tree is walked. Components
 * are matched by **identity** against the same `@fablab/ui` module instance the page imports,
 * so a look-alike strip of divs cannot satisfy `PixelImage`.
 */

/** The declared tie-break, verbatim from FR-013 and tasks.md T043. Written out once, here, so
 *  the assertion below is against the spec's string and not against whatever the page happens
 *  to pass. */
/**
 * The keys FR-013 declares, as an ARRAY — which is the only form the data layer honours.
 *
 * It was `'-xpTotal,handle'` until `tests/public/ranking-ordem.test.ts` asked a real Postgres:
 * the comma form is REST-only, the local API does not split it, and drizzle wraps it whole,
 * fails to resolve a column of that name and silently falls back to `-createdAt`. The fake below
 * split the comma, so this file was the only witness and it agreed with the page's intent
 * instead of with the database.
 */
const ORDENACAO_DECLARADA = ['-xpTotal', 'handle']

type PerfilFixture = {
  readonly id: number
  readonly nome: string
  readonly handle: string
  readonly xpTotal: number
  readonly avatarRender: { readonly url: string } | null
}

/**
 * Four makers of this lab, **stored out of rank order** — see the header.
 *
 * `brunoalves` and `carladias` are tied at 12 XP and **Carla is stored first**, so the declared
 * ascending `handle` tie-break is the only thing that can put Bruno ahead of her.
 */
const BRUNO: PerfilFixture = {
  id: 3,
  nome: 'Bruno Alves',
  handle: 'brunoalves',
  xpTotal: 12,
  avatarRender: { url: '/media/bruno.png' },
}

const ANA: PerfilFixture = {
  id: 1,
  nome: 'Ana Prado',
  handle: 'anaprado',
  xpTotal: 40,
  avatarRender: { url: '/media/ana.png' },
}

/** No render yet: `avatarRender` is composed by a flow that has not run for every account, and
 *  a maker with no art still has a place in the ranking. */
const CARLA: PerfilFixture = {
  id: 4,
  nome: 'Carla Dias',
  handle: 'carladias',
  xpTotal: 12,
  avatarRender: null,
}

/** Zero XP is a real standing, not an absent one — a new maker is last, never missing. */
const DAVI: PerfilFixture = {
  id: 2,
  nome: 'Davi Souza',
  handle: 'davisouza',
  xpTotal: 0,
  avatarRender: null,
}

const PERFIS: readonly PerfilFixture[] = [CARLA, ANA, BRUNO, DAVI]

/** What the page must render, top to bottom, for the fixture above. */
const ORDEM_ESPERADA = [ANA.handle, BRUNO.handle, CARLA.handle, DAVI.handle]

/** One `sort` key: the field, and whether it descends. */
function chaveDeOrdenacao(chave: string): { campo: string; desc: boolean } {
  const limpa = chave.trim()
  return limpa.startsWith('-') ? { campo: limpa.slice(1), desc: true } : { campo: limpa, desc: false }
}

/**
 * The rows as a database given this `sort` would return them.
 *
 * With no `sort` the fixture order is returned **untouched**: an unordered query has no promise
 * to keep, and pretending otherwise is what would make FR-013 unprovable here.
 *
 * **It does not split a comma, and that omission is the point.** It used to, and a fake that
 * splits one models a behaviour the real stack does not have: the comma form is REST-only, and
 * on the local API `buildOrderBy` wraps the whole string, resolves no column and falls back to
 * `-createdAt`. A single string here is therefore ONE key, exactly as drizzle reads it — so a
 * page that regressed to the comma form would sort by a field called `xpTotal,handle`, find
 * nothing to compare, and leave the fixture order untouched, which §2 catches.
 */
function ordenar(
  perfis: readonly PerfilFixture[],
  sort: string | readonly string[] | undefined,
): PerfilFixture[] {
  const declaradas = typeof sort === 'string' ? [sort] : (sort ?? [])
  if (declaradas.length === 0 || declaradas.every((chave) => chave.trim() === '')) return [...perfis]
  const chaves = declaradas.map(chaveDeOrdenacao)
  return [...perfis].sort((a, b) => {
    for (const { campo, desc } of chaves) {
      const esquerda = (a as unknown as Record<string, unknown>)[campo]
      const direita = (b as unknown as Record<string, unknown>)[campo]
      if (esquerda === direita) continue
      const menor = typeof esquerda === 'number' && typeof direita === 'number'
        ? esquerda < direita
        : String(esquerda) < String(direita)
      return (menor ? -1 : 1) * (desc ? -1 : 1)
    }
    return 0
  })
}

/**
 * The signed-in maker's own client — the door D6 says serves this page, because `perfilMaker`
 * carries no `publicList` declaration and the anonymous client refuses to list it.
 *
 * The write methods are spies that exist: a client missing them would let §5 pass by
 * `TypeError` rather than by the page not writing, which is the same green for the opposite
 * reason.
 */
class FakeLabClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'
  readonly create = vi.fn(async () => ({}))
  readonly update = vi.fn(async () => ({}))
  readonly delete = vi.fn(async () => ({}))

  constructor(
    private readonly perfis: readonly PerfilFixture[] = PERFIS,
    private readonly falha = false,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha) throw new Error(`leitura de ${args.collection} falhou`)
    if (args.collection !== 'perfilMaker') return { docs: [] as T[], totalDocs: 0 }
    const ordenados = ordenar(this.perfis, args.sort)
    const docs = ordenados.slice(0, args.limit ?? ordenados.length) as unknown as T[]
    return { docs, totalDocs: this.perfis.length }
  }

  findByID = async <T>(): Promise<T | null> => null

  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
}

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => null),
  getTenantScopedPayloadForRSC: vi.fn(),
}))

vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

const pagina = await import('../../app/(frontend)/ranking/page')
const { default: Page, RANKING_PATH, metadata } = pagina as {
  default: () => Promise<ReactElement>
  RANKING_PATH: string
  metadata: { title?: string }
}

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'ranking', 'page.tsx'),
  'utf8',
)

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth first — identity, so a look-alike does
 *  not satisfy the assertion. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every string the tree would print, joined. A `<style>` block is CSS, not copy. */
function texto(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

/** Every `<a href>` in the tree, with the text inside it. */
function links(node: ReactNode): { href: string; label: string }[] {
  return findAll(node, 'a').map((anchor) => ({
    href: String(anchor.props.href ?? ''),
    label: texto(anchor.props.children as ReactNode).trim(),
  }))
}

/**
 * The handles the page prints, **in the order a reader meets them**.
 *
 * Read out of the rendered text rather than off a prop, so a page that sorted its query and
 * then rendered from an unsorted copy is still caught.
 */
function ordemDosHandles(tree: ReactNode, perfis: readonly PerfilFixture[] = PERFIS): string[] {
  const copia = texto(tree)
  return perfis.map((perfil) => ({ handle: perfil.handle, at: copia.indexOf(formatHandle(perfil.handle)) }))
    .filter((entrada) => entrada.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entrada) => entrada.handle)
}

/** The row this maker occupies — the unit US6 describes ("avatar, @handle and XP total"). */
function linhaDe(tree: ReactNode, handle: string): AnyElement {
  const linha = findAll(tree, 'li').find((node) => texto(node).includes(formatHandle(handle)))
  if (!linha) throw new Error(`a página não renderizou uma linha para "${formatHandle(handle)}"`)
  return linha
}

type Render = { tree: ReactNode; lab: FakeLabClient }

type OpcoesDeRender = {
  /** `null` is the signed-out visitor. The default is a signed-in maker, because SC-018 is
   *  written about the answer `/ranking` gives one. */
  readonly sessao?: { id: string | number } | null
  readonly perfis?: readonly PerfilFixture[]
  readonly falha?: boolean
}

async function renderizar(opcoes: OpcoesDeRender = {}): Promise<Render> {
  const lab = new FakeLabClient(opcoes.perfis ?? PERFIS, opcoes.falha ?? false)
  mocks.currentUser.mockResolvedValue(opcoes.sessao === undefined ? { id: 7 } : opcoes.sessao)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(lab)
  const tree = (await Page()) as ReactNode
  return { tree, lab }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read, and the tie-break it declares (FR-013, FR-028)', () => {
  it('reads this lab\'s profiles through the scoped choke point', async () => {
    const { lab } = await renderizar()

    const leitura = lab.paraColecao('perfilMaker')[0]
    expect(leitura, 'the page never read `perfilMaker`, so there is no ranking on it').toBeDefined()
    expect(mocks.getTenantScopedPayloadForRSC).toHaveBeenCalled()
  })

  it('names the declared tie-break, and not the XP alone', async () => {
    const { lab } = await renderizar()

    expect(
      lab.paraColecao('perfilMaker')[0]?.sort,
      'FR-013 asks for a DECLARED tie-break. `-xpTotal` alone leaves two makers at equal XP in ' +
        'whatever order Postgres returns, which differs between runs and makes SC-013 unprovable.',
    ).toEqual(ORDENACAO_DECLARADA)
  })

  it('names no tenant of its own — the door owns the scope', async () => {
    const { lab } = await renderizar()

    expect(JSON.stringify(lab.paraColecao('perfilMaker')[0]?.where ?? {})).not.toContain('tenant')
  })

  it('asks for more than Payload\'s default page, and for the avatar to arrive drawable', async () => {
    const { lab } = await renderizar()
    const leitura = lab.paraColecao('perfilMaker')[0]

    // Payload's own default is 10. A lab with an eleventh maker would silently lose them from
    // the bottom of the ranking, which is the one place a maker looks for themselves.
    expect(Number(leitura?.limit ?? 10)).toBeGreaterThan(10)
    // `avatarRender` is a relationship: at depth 0 it is an id, and US6 asks for the avatar.
    expect(Number(leitura?.depth ?? 0)).toBeGreaterThanOrEqual(1)
  })

  it('never reaches Payload directly', () => {
    expect(PAGE_SOURCE).not.toMatch(/from ['"]payload['"]/)
    expect(PAGE_SOURCE).not.toMatch(/req\.payload/)
    expect(PAGE_SOURCE).not.toMatch(/getPayload\b/)
  })

  it('is a server component — the page adds no island (SC-015)', () => {
    expect(
      PAGE_SOURCE.trimStart().startsWith("'use client'") ||
        PAGE_SOURCE.trimStart().startsWith('"use client"'),
      'a \'use client\' here turns the ranking into a client bundle, and SC-015 keeps the island ' +
        'count unchanged.',
    ).toBe(false)
  })

  it('titles the document and exports its own path', () => {
    expect(metadata.title).toContain('RANKING')
    expect(RANKING_PATH).toBe('/ranking')
  })
})

describe('§2 — highest first, ties broken by handle (FR-013, US6)', () => {
  it('lists the makers in the declared order', async () => {
    const { tree } = await renderizar()

    expect(
      ordemDosHandles(tree),
      'the ranking is the order. Carla and Bruno are both at 12 XP and Carla is stored first, ' +
        'so only the ascending `handle` tie-break can put him ahead of her (FR-013).',
    ).toEqual(ORDEM_ESPERADA)
  })

  it('shows each maker\'s @handle and XP total', async () => {
    const { tree } = await renderizar()
    const linha = linhaDe(tree, ANA.handle)

    expect(texto(linha)).toContain(formatHandle(ANA.handle))
    expect(
      texto(linha),
      'US6 asks for the XP total beside the handle — a ranking with no numbers cannot be read ' +
        'as one.',
    ).toContain(String(ANA.xpTotal))
  })

  it('shows each maker\'s avatar where there is art for it', async () => {
    const { tree } = await renderizar()

    const avatar = findAll(linhaDe(tree, ANA.handle), PixelImage)[0]
    expect(avatar, 'US6 asks for the avatar, and `avatarRender` is the PNG composed for it').toBeDefined()
    expect(String(avatar?.props.src)).toBe(ANA.avatarRender?.url)
  })

  it('keeps a maker with no avatar render in the ranking, drawing no art for them', async () => {
    const { tree } = await renderizar()

    const linha = linhaDe(tree, CARLA.handle)
    expect(texto(linha)).toContain(formatHandle(CARLA.handle))
    expect(
      findAll(linha, PixelImage),
      'a profile whose render has not been composed yet still has a standing. An <img> with no ' +
        'source is a broken frame, not an avatar.',
    ).toEqual([])
  })

  it('numbers the places, so a maker can find their own', async () => {
    const { tree } = await renderizar()

    expect(texto(linhaDe(tree, ANA.handle))).toContain('1')
    expect(texto(linhaDe(tree, DAVI.handle))).toContain('4')
  })

  it('gives a maker at zero XP a place rather than dropping them', async () => {
    const { tree } = await renderizar()

    expect(texto(linhaDe(tree, DAVI.handle))).toContain(formatHandle(DAVI.handle))
  })
})

describe('§3 — the order is the same on every run (SC-013)', () => {
  it('renders the same order whatever order the rows are stored in', async () => {
    const { tree: primeira } = await renderizar({ perfis: PERFIS })
    const { tree: segunda } = await renderizar({ perfis: [...PERFIS].reverse() })

    // Two runs of the same query over the same rows. Without the `handle` tie-break the tied
    // pair follows the storage order, and these two arrays differ — which is exactly what
    // SC-013 says must never happen.
    expect(ordemDosHandles(segunda)).toEqual(ordemDosHandles(primeira))
    expect(ordemDosHandles(segunda)).toEqual(ORDEM_ESPERADA)
  })
})

describe('§4 — the signed-out visitor (SC-018)', () => {
  it('reads nothing at all, and invites them in', async () => {
    const { lab } = await renderizar({ sessao: null })

    expect(mocks.getTenantScopedPayloadForRSC).not.toHaveBeenCalled()
    expect(lab.calls).toEqual([])
  })

  it('sends them to sign in and brings them back here', async () => {
    const { tree } = await renderizar({ sessao: null })

    const convite = links(tree).find((link) => link.href.startsWith('/login'))
    expect(convite, 'an invitation with no link is a sentence').toBeDefined()
    expect(convite?.href).toContain(`de=${encodeURIComponent('/ranking')}`)
    expect(convite?.label.length).toBeGreaterThan(0)
  })

  it('shows no maker of this lab to an unidentified visitor', async () => {
    const { tree } = await renderizar({ sessao: null })

    expect(ordemDosHandles(tree)).toEqual([])
  })
})

describe('§5 — it displays; it never awards (FR-022)', () => {
  it('writes nothing, by any door', async () => {
    const { lab } = await renderizar()

    expect(lab.create).not.toHaveBeenCalled()
    expect(lab.update).not.toHaveBeenCalled()
    expect(lab.delete).not.toHaveBeenCalled()
  })
})

describe('§6 — the two states a roster can be in', () => {
  it('reports an empty roster as empty, not as an error', async () => {
    const { tree } = await renderizar({ perfis: [] })

    const vazio = findAll(tree, EmptyState)[0]
    expect(vazio).toBeDefined()
    expect(vazio?.props.variant).toBe('vazio')
  })

  it('reports a failed read in place, with a retry', async () => {
    const { tree } = await renderizar({ falha: true })

    const erro = findAll(tree, EmptyState)[0]
    expect(erro).toBeDefined()
    expect(erro?.props.variant).toBe('erro')
  })
})

/* ───────────────────────────────────────────────────────────────────────────────────────────
 * T043b / SC-013, SC-015, SC-018 — the three claims T043 cannot make about itself.
 *
 * §1–§6 above prove the page asks for the declared sort and renders one fixture in the order it
 * comes back. That leaves three gaps, and each is a requirement rather than a nicety:
 *
 * 1. **SC-013 says "across runs", and one reversed fixture is two runs.** A tie-break that
 *    happens to survive `PERFIS` and `PERFIS.reverse()` can still be the wrong key. §7 asks the
 *    question the requirement asks: over EVERY order the rows could arrive in, and with a tied
 *    group whose names deliberately disagree with their handles, is the rendered order always
 *    the same one? `-xpTotal,nome` passes every assertion above — Bruno Alves sorts before Carla
 *    Dias by name as well as by handle — so without §7 the declared key is only checked as a
 *    string, and a page that sorted by the wrong second field would ship green.
 * 2. **SC-015 is about the island COUNT, and a page is not only its `page.tsx`.** The existing
 *    check reads one file's first line. An island arrives two other ways: a sibling component in
 *    the route folder carrying the directive (`criar-conta/PassoDoAvatar.tsx` is exactly that
 *    shape), or an import of a component that is already an island somewhere else — which adds
 *    no `'use client'` to this route at all and still puts a bundle on the page. §8 asks the
 *    tree, not a list: a file is an island when `'use client'` is its **first statement**, the
 *    same authority `packages/ui/tests/islands.test.ts` uses.
 * 3. **SC-018's premise is that the roster is not published.** D6 reasons from `perfilMaker`
 *    carrying no `publicList` declaration; §9 asks the registry instead of repeating the
 *    sentence, so the day someone publishes the roster this page's reasoning goes red where it
 *    is written down rather than silently ceasing to hold.
 */

/** Repo root: `apps/web/tests/public` → four levels up. */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..')

/** The route folder — the page and any sibling it grows. */
const ROTA_DO_RANKING = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'ranking')

/** Where an island can live in this repo: the design system and the app's own routes. */
const ARVORES_VARRIDAS = [join(REPO_ROOT, 'packages', 'ui', 'src'), join(REPO_ROOT, 'apps', 'web', 'app')]

const EXTENSOES_DE_FONTE = ['.ts', '.tsx']
const PASTAS_IGNORADAS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git'])

/** Every source file under `dir`, recursively. */
function arquivosDeFonte(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) return PASTAS_IGNORADAS.has(entrada.name) ? [] : arquivosDeFonte(caminho)
    return EXTENSOES_DE_FONTE.some((ext) => entrada.name.endsWith(ext)) ? [caminho] : []
  })
}

/** `source` with the blank lines and comments React skips removed, so the caller can ask what
 *  the file's **first statement** actually is. */
function primeiraDeclaracao(source: string): string {
  let resto = source.trimStart()
  for (;;) {
    if (resto.startsWith('//')) {
      resto = resto.slice(resto.indexOf('\n') + 1).trimStart()
      continue
    }
    if (resto.startsWith('/*')) {
      const fim = resto.indexOf('*/')
      // An unterminated block comment is a syntax error the compiler owns, not this scan's.
      if (fim === -1) return ''
      resto = resto.slice(fim + 2).trimStart()
      continue
    }
    return resto
  }
}

/**
 * Is this file an island?
 *
 * The question is asked of the **directive**, never of the substring: this very file discusses
 * `'use client'` in prose a dozen times, and so do three components in `packages/ui`. A
 * directive is only a directive as the first statement, which is the rule
 * `packages/ui/tests/islands.test.ts` was written to and the one React actually applies.
 */
const ehIlha = (source: string): boolean => /^['"]use client['"]/.test(primeiraDeclaracao(source))

const EXPORTACAO_RE = /^export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm

/** The names a module publishes. Importing ANY of them from an island pulls that island's
 *  bundle in — a constant exported beside a `useState` is still a client module. */
function identificadoresExportados(source: string): string[] {
  return [...source.matchAll(EXPORTACAO_RE)].map((achado) => achado[1] as string)
}

/** Every island in the tree, mapped from the name it exports to the file that carries the
 *  directive — derived by scanning, never from a list this test maintains. */
const EXPORTACOES_DE_ILHAS: ReadonlyMap<string, string> = new Map(
  ARVORES_VARRIDAS.flatMap(arquivosDeFonte)
    .map((caminho) => ({ caminho, fonte: readFileSync(caminho, 'utf8') }))
    .filter(({ fonte }) => ehIlha(fonte))
    .flatMap(({ caminho, fonte }) =>
      identificadoresExportados(fonte).map((nome) => [nome, caminho.slice(REPO_ROOT.length)] as const),
    ),
)

/** The page's import statements, with nothing else of the file. Multi-line by design: a long
 *  named-import list wraps, and a scan that stopped at the newline would see half of it. */
const IMPORTS_DA_PAGINA = PAGE_SOURCE.match(/^import\s[\s\S]*?from\s*['"][^'"]+['"]/gm) ?? []

/** Every ordering of `itens` — the storage orders a database is free to hand rows back in. */
function permutacoes<T>(itens: readonly T[]): T[][] {
  if (itens.length <= 1) return [[...itens]]
  return itens.flatMap((item, indice) =>
    permutacoes([...itens.slice(0, indice), ...itens.slice(indice + 1)]).map((resto) => [item, ...resto]),
  )
}

/**
 * Three makers tied at the same XP, whose **names disagree with their handles** — and with
 * their ids, in both directions.
 *
 * By handle ascending: `ana, bia, caio`. By `nome` ascending: `caio, ana, bia`; descending:
 * `bia, ana, caio`. By `id` ascending: `bia, ana, caio`; descending: `caio, ana, bia`. So the
 * expected order below is producible by exactly one second key — the one FR-013 declares — and
 * a page that tie-broke on the name a row happens to show, or on insertion order, is caught
 * here and nowhere else in this file.
 */
const EMPATE_TRIPLO: readonly PerfilFixture[] = [
  { id: 31, nome: 'Marina Luz', handle: 'ana', xpTotal: 9, avatarRender: null },
  { id: 30, nome: 'Zoe Prado', handle: 'bia', xpTotal: 9, avatarRender: null },
  { id: 32, nome: 'Aline Vaz', handle: 'caio', xpTotal: 9, avatarRender: null },
]

const ORDEM_DO_EMPATE = ['ana', 'bia', 'caio']

describe('§7 — the same order on every run, whatever order the rows arrive in (SC-013)', () => {
  it('renders one order for all 24 storage orders of the roster', async () => {
    const ordens: string[][] = []
    for (const armazenada of permutacoes(PERFIS)) {
      const { tree } = await renderizar({ perfis: armazenada })
      ordens.push(ordemDosHandles(tree))
    }

    expect(ordens).toHaveLength(24)
    for (const [indice, ordem] of ordens.entries()) {
      expect(
        ordem,
        `storage order #${indice} rendered a different ranking. SC-013: the tie-break is ` +
          'deterministic across runs, and a run is free to return the tied pair either way ' +
          'round unless a second key decides it.',
      ).toEqual(ORDEM_ESPERADA)
    }
  })

  it('breaks the tie on the HANDLE, not on the name the row shows or the order it was made', async () => {
    for (const armazenada of permutacoes(EMPATE_TRIPLO)) {
      const { tree } = await renderizar({ perfis: armazenada })

      expect(
        ordemDosHandles(tree, EMPATE_TRIPLO),
        'FR-013 declares `handle` as the second key. `nome` and `id` each order these three ' +
          'makers differently in both directions, so an order that is not this one means the ' +
          'page tie-broke on something the requirement did not name.',
      ).toEqual(ORDEM_DO_EMPATE)
    }
  })
})

describe('§8 — the page adds no island, by either route (SC-015)', () => {
  it('grows no client component beside itself in the route folder', () => {
    const doRanking = arquivosDeFonte(ROTA_DO_RANKING)

    // Non-vacuity first: a scan that found nothing would pass the assertion below over an empty
    // set, which is the failure this feature's preamble records twice.
    expect(
      doRanking.map((caminho) => caminho.slice(ROTA_DO_RANKING.length + 1)),
      'the scan saw no page.tsx, so whatever it is checking is not this route',
    ).toContain('page.tsx')

    expect(
      doRanking.filter((caminho) => ehIlha(readFileSync(caminho, 'utf8'))),
      'SC-015 keeps the island count unchanged, and a sibling component in the route folder ' +
        'raises it exactly as a directive on page.tsx would.',
    ).toEqual([])
  })

  it('imports nothing that is an island somewhere else', () => {
    // Non-vacuity: the derived set has to contain an island everyone knows about, or this test
    // is asserting that the page imports nothing from an empty list.
    expect(
      [...EXPORTACOES_DE_ILHAS.keys()],
      'the island scan came back without LikeButton, so it is not seeing the tree',
    ).toContain('LikeButton')

    const importadas = [...EXPORTACOES_DE_ILHAS].filter(([nome]) =>
      IMPORTS_DA_PAGINA.some((bloco) => new RegExp(`\\b${nome}\\b`).test(bloco)),
    )

    expect(
      importadas,
      'importing a component that already carries `use client` puts its bundle on this page ' +
        'without adding a directive to this route — the island count moves and no file here ' +
        'changed. SC-015 counts bundles, not directives.',
    ).toEqual([])
  })
})

describe('§9 — the roster is not published, which is why the door is the signed-in one (SC-018)', () => {
  it('asks the registry, rather than repeating D6\'s sentence', () => {
    // The positive control comes first: without it, a `publicListReason` that answered
    // `undefined` for everything would make the real assertion pass by being broken.
    expect(
      publicListReason('categoriaArtigo'),
      'the helper answered `undefined` for a collection that DOES declare `publicList`, so its ' +
        'answer about perfilMaker means nothing',
    ).toEqual(expect.any(String))

    expect(
      publicListReason('perfilMaker'),
      'a lab\'s roster of makers and handles carries no `publicList` declaration, which is why ' +
        '/ranking reads through the signed-in door (D6, SC-018). Publishing it is a decision ' +
        'about what the platform says about people, and it belongs to whoever argues for it — ' +
        'not to a green test.',
    ).toBeUndefined()
  })

  it('reads perfilMaker once, and reads nothing else at all', async () => {
    const { lab } = await renderizar()

    expect(
      lab.calls.map((chamada) => chamada.collection),
      'one read, of one collection, through one door. A second read is a second place for the ' +
        'scope to be got wrong (FR-028).',
    ).toEqual(['perfilMaker'])
  })
})
