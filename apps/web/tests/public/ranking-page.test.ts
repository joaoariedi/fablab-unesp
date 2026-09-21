import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, PixelImage, formatHandle } from '@fablab/ui'

import { publicListReason } from '../../lib/tenancy/scope-registry'

/**
 * T043 / FR-013, FR-037, US6 — `/ranking`: this lab's makers by XP, **with the tie-break
 * declared**.
 *
 * ── T012: the page moved onto `readPublicRanking`, and the board became public ──────────────
 *
 * It read `perfilMaker` through the signed-in choke point and showed a visitor with no session
 * an invitation instead of a board. FR-017 publishes the ranking — the Home card shows its top
 * five to exactly that visitor — so the page now reads through `readPublicRanking`, whose bound
 * is the `select` the anonymous door demands (CLR-010). §4 asserts the inversion, §1 asserts the
 * old door is not reached at all, and §9 asks the registry whether the roster really is
 * published rather than repeating the sentence.
 *
 * ── Why the fake SORTS instead of returning its rows in fixture order ───────────────────────
 *
 * FR-013's whole content is the *order*, and a fake that answered every read with the same
 * array would make the rendering unfalsifiable: a page that rendered an unsorted copy would look
 * exactly like one that rendered the ranked rows. So `FakeRankingReader` applies the DECLARED
 * order, which is what the real reader asks Postgres for (`sort: ORDENACAO_DO_RANKING`, measured
 * against a real database in `tests/tenancy/public-ranking.test.ts` §2). Sorting here models the
 * reader's contract; what these sections still catch is the half of FR-021 that is this page's —
 * a page that re-sorts what it was handed, or renders from an unsorted copy of it.
 *
 * The fixture is therefore stored in an order that is *not* the ranked one, and the two makers
 * tied at 12 XP are stored with the alphabetically **later** handle first — `carladias` ahead of
 * `brunoalves`, so the rendered order can never be the stored one by accident.
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
 * `readPublicRanking` (T009), standing in for the database behind it.
 *
 * It answers with the DECLARED order because the real reader asks for it, and it makes the
 * FR-022 split the real reader makes: `null` is a **failed** read and `[]` is a lab with no
 * makers — two different screens, which §6 asserts.
 *
 * The limits it was asked for are recorded rather than the whole argument list: after T012 the
 * tenant, the sort, the projection and the depth all belong to the reader (and are measured
 * against a real Postgres in `tests/tenancy/public-ranking.test.ts`), and the only thing the
 * page still decides is how many places the board draws.
 */
class FakeRankingReader {
  readonly limites: number[] = []

  constructor(
    private readonly perfis: readonly PerfilFixture[] = PERFIS,
    private readonly falha = false,
  ) {}

  ler = async (limit: number): Promise<PerfilFixture[] | null> => {
    this.limites.push(limit)
    if (this.falha) return null
    return ordenar(this.perfis, ORDENACAO_DECLARADA).slice(0, limit)
  }
}

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => null),
  getTenantScopedPayloadForRSC: vi.fn(),
  readPublicRanking: vi.fn<(limite: number) => Promise<unknown[] | null>>(),
}))

// The signed-in door stays mocked even though the page no longer reaches it: §1 asserts it is
// never called, and a spy that was never installed would report `not.toHaveBeenCalled()` as a
// pass on a page that called the real thing.
vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))

/**
 * The anonymous reader, replaced whole rather than spread over the original.
 *
 * `public-payload.ts` imports `ORDENACAO_DO_RANKING` from this very page, so spreading the real
 * module would pull the module under test back through its own mock; and that module's top level
 * reaches `payload` itself, which no page suite needs loaded. The page imports exactly one thing
 * from it, and this factory is that one thing — so a page that started importing a second would
 * fail loudly here rather than read through an unfaked door.
 */
vi.mock('../../lib/tenancy/public-payload', () => ({ readPublicRanking: mocks.readPublicRanking }))

const pagina = await import('../../app/(frontend)/ranking/page')
const { default: Page, RANKING_PATH, ORDENACAO_DO_RANKING, metadata } = pagina as {
  default: () => Promise<ReactElement>
  RANKING_PATH: string
  ORDENACAO_DO_RANKING: readonly string[]
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

type Render = { tree: ReactNode; leitor: FakeRankingReader }

type OpcoesDeRender = {
  /** `null` is the signed-out visitor. The default is a signed-in maker — and after T012 the
   *  two must receive the SAME board (FR-017), which is what §4 asserts. */
  readonly sessao?: { id: string | number } | null
  readonly perfis?: readonly PerfilFixture[]
  readonly falha?: boolean
}

async function renderizar(opcoes: OpcoesDeRender = {}): Promise<Render> {
  const leitor = new FakeRankingReader(opcoes.perfis ?? PERFIS, opcoes.falha ?? false)
  mocks.currentUser.mockResolvedValue(opcoes.sessao === undefined ? { id: 7 } : opcoes.sessao)
  mocks.readPublicRanking.mockImplementation(leitor.ler)
  const tree = (await Page()) as ReactNode
  return { tree, leitor }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read: the anonymous reader, and one call through it (FR-017, FR-021)', () => {
  it('reads the board through `readPublicRanking`, and not through the signed-in door', async () => {
    const { leitor } = await renderizar()

    expect(
      leitor.limites,
      'T012 moves this page onto `readPublicRanking`. A page that never calls it has no board to ' +
        'show a visitor with no session, which is the whole of FR-017 here.',
    ).toHaveLength(1)
    expect(
      mocks.getTenantScopedPayloadForRSC,
      'the signed-in choke point served this page until T012. Reaching it now puts the roster ' +
        'back behind a session and leaves the Home card publishing what the page refuses to.',
    ).not.toHaveBeenCalled()
  })

  it('hands the reader a limit and nothing else', async () => {
    await renderizar()

    // The tenant, the sort, the projection and the depth are the READER's — measured against a
    // real Postgres in tests/tenancy/public-ranking.test.ts. A page passing any of them again
    // would be a second opinion on the anonymous surface, which is the one place D2 says there
    // must be exactly one.
    expect(mocks.readPublicRanking.mock.calls[0]).toEqual([expect.any(Number)])
  })

  it('declares the order once and sorts nothing of its own (FR-021)', async () => {
    await renderizar()

    expect(
      ORDENACAO_DO_RANKING,
      'the page still DECLARES the order — `public-payload.ts` imports this constant, so a page ' +
        'that stopped exporting it would take the reader\'s sort with it.',
    ).toEqual(ORDENACAO_DECLARADA)
    expect(
      PAGE_SOURCE,
      'the order arrives ordered. A sort here is a second ranking, free to disagree with the one ' +
        'the Home card reads through the same function (FR-021).',
    ).not.toMatch(/\.sort\(/)
  })

  it('asks for more than Payload\'s default page', async () => {
    const { leitor } = await renderizar()

    // Payload's own default is 10. A lab with an eleventh maker would silently lose them from
    // the bottom of the ranking, which is the one place a maker looks for themselves.
    expect(Number(leitor.limites[0] ?? 10)).toBeGreaterThan(10)
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

describe('§4 — the board is public: a visitor with no session reads it (FR-017, T012)', () => {
  it('serves the signed-out visitor the ranking, not an invitation', async () => {
    const { tree, leitor } = await renderizar({ sessao: null })

    expect(leitor.limites, 'the signed-out visitor was served no read at all').toHaveLength(1)
    expect(
      ordemDosHandles(tree),
      'until T012 this page refused a visitor with no session and drew an invitation in place of ' +
        'the board. FR-017 publishes the ranking — the Home card shows its top five to that same ' +
        'visitor — so a signed-out reader who meets no maker is the shipped CLR-004 failure mode.',
    ).toEqual(ORDEM_ESPERADA)
  })

  it('shows them the same board it shows a signed-in maker', async () => {
    const { tree: anonimo } = await renderizar({ sessao: null })
    const { tree: identificado } = await renderizar({ sessao: { id: 7 } })

    expect(
      ordemDosHandles(anonimo),
      'one board, one order, whoever is reading it. A session that changes the ranking is a ' +
        'second ranking (FR-021).',
    ).toEqual(ordemDosHandles(identificado))
  })

  it('sends nobody to /login from a page that no longer needs one', async () => {
    const { tree } = await renderizar({ sessao: null })

    expect(
      links(tree).filter((link) => link.href.startsWith('/login')),
      'the sign-in invitation was the screen this page gave instead of the board. Leaving it ' +
        'beside the rendered ranking tells a visitor they are missing something they are reading.',
    ).toEqual([])
  })
})

describe('§5 — it displays; it never awards (FR-022)', () => {
  it('writes nothing, by any door', () => {
    // `readPublicRanking` returns rows and the public client exposes no create/update/delete at
    // all (lib/tenancy/public-payload.ts, asserted in tests/tenancy/public-payload.test.ts), so
    // after T012 there is no writer left for a spy to watch. What remains possible is a second
    // door opened by hand in this file, and that is what is looked for.
    expect(PAGE_SOURCE).not.toMatch(/\.(create|update|delete)\s*\(/)
    expect(
      PAGE_SOURCE,
      'the page reads through `readPublicRanking` and nothing else. Any other client here is a ' +
        'second scope decision, and the anonymous surface is where D2 allows exactly one.',
    ).not.toMatch(/getTenantScopedPayload|getSystemScopedPayload|getPublicScopedPayload/)
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
 * 3. **T012's premise is that the roster IS published, under a projection.** The page reads with
 *    no session, which is only possible because T008 declared `publicList` on `perfilMaker` and
 *    made the anonymous door refuse any read of it that names no columns. §9 asks the registry
 *    instead of repeating the sentence, so the day that declaration is withdrawn this page goes
 *    red where its reasoning is written down rather than rendering an error to every visitor.
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

describe('§9 — the roster is published, under a projection (FR-017, FR-030, CLR-010)', () => {
  it('asks the registry, rather than repeating the sentence', () => {
    // The positive control comes first: without it, a `publicListReason` that answered
    // `undefined` for everything would make the real assertion pass by being broken.
    expect(
      publicListReason('categoriaArtigo'),
      'the helper answered `undefined` for a collection that DOES declare `publicList`, so its ' +
        'answer about perfilMaker means nothing',
    ).toEqual(expect.any(String))

    expect(
      publicListReason('perfilMaker'),
      'T008 admitted the roster to the anonymous door so that a visitor with no session can read ' +
        'this board (FR-017). Withdraw the declaration and `readPublicRanking` is refused for ' +
        'everyone who is not signed in, and this page renders its error state to them instead — ' +
        'so the sentence lives in the registry, and this is where the page checks it is still true.',
    ).toEqual(expect.any(String))
  })

  it('reads once, and reads nothing else at all', async () => {
    const { leitor } = await renderizar()

    expect(
      leitor.limites,
      'one read, through one door. A second read is a second place for the scope to be got ' +
        'wrong (FR-028).',
    ).toHaveLength(1)
  })
})

/* ───────────────────────────────────────────────────────────────────────────────────────────
 * T013 / FR-017, US5 — **the shipped defect, named**: the signed-out board that showed no board.
 *
 * §4 asks whether the visitor with no session is served the roster in the DECLARED ORDER, and
 * that is one half of FR-017. The other half is the failure CLR-004 refused to ship and this
 * page shipped anyway: a visitor on a lab whose roster is full, reading a screen that has no
 * roster on it. **The two screens differ in SHAPE, not in order** — neither the invitation this
 * page served until T012 nor an `EmptyState` prints a single handle, so `ordemDosHandles`
 * compares `[]` against the expected order and §4 reports the same failure for a page that drew
 * the wrong body as for one that drew the right body in the wrong sequence. Nothing in §4 or §6
 * ever asks WHICH of the bodies the anonymous visitor received.
 *
 * Measured, not assumed: run against the page as it stood at HEAD, the three cases below fail
 * with "expected [] to have a length of 1", "sem linha para anaprado" and "expected undefined to
 * be 'vazio'" — the signed-out screen had no `<li>`, no handle and no empty state on it at all.
 *
 * So this section asks the question in both directions, because an assertion that no empty body
 * was drawn is satisfied by a page that can no longer draw one:
 *
 *   1. a lab WITH makers, read with no session → the board itself, and no empty body;
 *   2. that same visitor gets every column US5 names — place, avatar, name, `@handle`, XP —
 *      and not the handle alone, which is all §4 reads out of the tree;
 *   3. a lab with NO makers, read with no session → the empty body still, and the sentence that
 *      says so, so (1) cannot pass by the page having lost the screen rather than having stopped
 *      showing it to the wrong visitor.
 */

/** The wording an empty board carries, in both forms this product writes it: the page's own
 *  (*"Nenhum maker neste lab ainda."*) and the Home card's (*"Ainda sem makers no ranking"*,
 *  `docs/product/pages/home.md` § ranking, quoted by T013). Matched loosely, so a rewrite of the
 *  sentence does not turn this into a test of copy — what is asserted is that the screen saying
 *  *nobody is here* is not the screen a visitor gets on a lab where somebody is. */
const DIZ_QUE_NAO_HA_MAKERS = /nenhum maker|sem makers/i

/**
 * Everything an `EmptyState` says, read out of its **props**.
 *
 * Measured while writing §10: `titulo` and `descricao` are props, not children, so `texto()`
 * walks straight past them and a regex over the rendered text finds that copy on no screen at
 * all — asserting its absence that way passes on the empty screen too, and asserts nothing.
 */
function copiaDosVazios(tree: ReactNode): string {
  return findAll(tree, EmptyState)
    .map((estado) => `${String(estado.props.titulo ?? '')} ${String(estado.props.descricao ?? '')}`)
    .join(' ')
}

describe('§10 — the signed-out visitor gets a BOARD, not a screen without one (T013, FR-017, US5)', () => {
  it('never answers a visitor with no session as though a lab full of makers had none', async () => {
    const { tree } = await renderizar({ sessao: null })

    expect(
      findAll(tree, EmptyState),
      'the roster held four makers and the anonymous visitor was handed an empty state. That is ' +
        'the shipped CLR-004 failure mode word for word: a zero that looks like a working product ' +
        'nobody uses, on a lab that has people in it.',
    ).toEqual([])
    expect(
      ordemDosHandles(tree),
      'the board is what this visitor came for, and FR-017 publishes it to them. A screen with ' +
        'no makers on it — the invitation this page served until T012, or an empty state — prints ' +
        'no handles, and every assertion in §4 reads the same `[]` for both of them.',
    ).toHaveLength(PERFIS.length)
  })

  it('gives that visitor the whole row — place, avatar, name, @handle and XP', async () => {
    const { tree } = await renderizar({ sessao: null })
    const linha = linhaDe(tree, ANA.handle)

    // §4 reads handles out of the tree and nothing else, so a page that served the anonymous
    // visitor a stripped row — the right handles in the right order, no name, no total, no art —
    // satisfies every assertion it makes. US5 names five things, and all five are hers.
    expect(texto(linha), 'no place number: a board a maker cannot find themselves on').toContain('1')
    expect(texto(linha), 'the name US5 asks for, beside the handle').toContain(ANA.nome)
    expect(texto(linha)).toContain(formatHandle(ANA.handle))
    expect(
      texto(linha),
      'the XP total is what the order is BY; a board without it is a list of names',
    ).toContain(String(ANA.xpTotal))
    expect(String(findAll(linha, PixelImage)[0]?.props.src)).toBe(ANA.avatarRender?.url)
  })

  it('still draws the empty screen, and its sentence, for a lab that really has no makers', async () => {
    const { tree } = await renderizar({ sessao: null, perfis: [] })

    // The control for the first case, and the reason it can mean anything: a page that stopped
    // rendering `EmptyState` altogether would pass that assertion while losing FR-022's split
    // between "empty" and "failed" for exactly the visitor this task is about.
    expect(findAll(tree, EmptyState)[0]?.props.variant).toBe('vazio')
    expect(
      copiaDosVazios(tree),
      'the sentence that says nobody is here belongs on the screen for a lab where nobody is',
    ).toMatch(DIZ_QUE_NAO_HA_MAKERS)
    expect(ordemDosHandles(tree), 'an empty lab has no places to draw').toEqual([])
  })
})
