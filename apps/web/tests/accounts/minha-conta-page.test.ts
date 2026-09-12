import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvatarPreview, EmptyState, SkillPips } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T034 / FR-021, FR-022, US5 — **Minha Conta**: the avatar, the name, the `@handle`, the skills
 * with their level and pips, and the maker's own content. It *displays*; it never awards.
 *
 * ── Why "displays, never awards" needs its own assertions (§5) ───────────────────────────────
 *
 * FR-022 is a requirement about what the page must NOT do, and a screen that quietly awarded XP
 * would look exactly like one that does not — right up until two makers' levels disagree with
 * the ledger feature 005 has not built yet. The only way to see it from outside is to hand the
 * page a client whose `create`/`update`/`delete` are spies and prove the render never reaches
 * for one, which is what § 5 does. A test that only read the rendered levels would pass over a
 * page that wrote them back first.
 *
 * ── Why the skills panel is filtered, and where that rule comes from (§4) ───────────────────
 *
 * `Skill.ts`: *"Skills inativas somem do painel sem alterar o XP de ninguém. Reativar faz o
 * progresso reaparecer."* Deactivation is the product's remove — the row survives so the XP
 * survives — so a profile keeps carrying skills the lab has retired, and a panel that renders
 * whatever the array holds shows a vocabulary the lab deliberately withdrew. The fixture
 * therefore carries a retired skill; without one the rule is unfalsifiable.
 *
 * ── Why the avatar is composed from the configuration and not read as a PNG ─────────────────
 *
 * `perfilMaker.avatarRender` is FR-024's composed PNG, and **nothing generates it yet** (T035
 * owns that, at P2). A page that displayed only that column would render an empty frame for
 * every account that exists today, so the avatar here is composed the way step 1 composes it:
 * the configuration names item ids, the global catalogue carries their sprites, `AvatarPreview`
 * stacks them. § 3 asserts against the catalogue rows, so a page drawing a placeholder — or
 * drawing somebody's avatar from a hard-coded config — fails rather than looks right.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * Feature 001's CLR-003 keeps the stack at Vitest with no DOM, so — exactly as `login-page` and
 * `excluir-page` do — the page is awaited as the async function it is and the returned tree is
 * walked. Components are matched by **identity** against the same `@fablab/ui` module instance
 * the page imports, so `SkillPips` cannot be satisfied by a look-alike strip of divs.
 */

/** The catalogue rows the profile's configuration names, populated at `depth: 1` — which is
 *  what turns `sprite` from a relationship id into a URL something can draw. */
const ITENS_DO_CATALOGO = [
  { id: 11, nome: 'Cabelo curto', categoria: 'cabelo', camadaZ: 40, sprite: { url: '/media/cabelo.png' } },
  { id: 12, nome: 'Olhos redondos', categoria: 'olhos', camadaZ: 30, sprite: { url: '/media/olhos.png' } },
  {
    id: 13,
    nome: 'Camiseta',
    categoria: 'roupaCima',
    camadaZ: 50,
    sprite: { url: '/media/camiseta.png' },
    spriteFolhas: { url: '/media/camiseta-folhas.png' },
  },
]

/** The lab's catalogue, and one row of it the team has retired (`ativa: false`). */
const SKILL_ATIVA = { id: 1, nome: 'Impressão 3D', slug: 'impressao-3d', ativa: true }
const SKILL_NOVA = { id: 2, nome: 'Corte a Laser', slug: 'corte-a-laser', ativa: true }
const SKILL_RETIRADA = { id: 3, nome: 'Serralheria', slug: 'serralheria', ativa: false }

const PERFIL = {
  id: 42,
  nome: 'Maria Silva',
  handle: 'mariasilva',
  avatarConfig: {
    base: 'f',
    pele: '5',
    cabeloTom: '2',
    itens: { cabelo: '11', olhos: '12', roupaCima: '13' },
    direcao: 'frente',
  },
  skills: [
    { skill: SKILL_ATIVA, nivel: 3, xp: 40 },
    // Level 0 is the state EVERY new account is in (FR-013), so the panel that cannot render it
    // is the panel nobody sees working.
    { skill: SKILL_NOVA, nivel: 0, xp: 0 },
    { skill: SKILL_RETIRADA, nivel: 7, xp: 90 },
  ],
}

const ARTIGO = { id: 20, titulo: 'Como calibrar sua impressora 3D', slug: 'como-calibrar', status: 'publicado' }
const MODELO = { id: 30, titulo: 'Bolsa Geométrica', slug: 'bolsa-geometrica', status: 'rascunho' }

/** Every row the fake client will answer with, keyed by collection. */
type Linhas = Readonly<Record<string, readonly unknown[]>>

const LINHAS_PADRAO: Linhas = {
  perfilMaker: [PERFIL],
  artigo: [ARTIGO],
  modelo3d: [MODELO],
  aula: [],
}

/**
 * The signed-in client, recorded rather than stubbed inline.
 *
 * The write methods are spies **that exist**: a client missing them would make § 5 pass by
 * `TypeError` rather than by the page not writing, which is the same green for the opposite
 * reason.
 */
class FakeContaClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'
  readonly create = vi.fn(async () => ({}))
  readonly update = vi.fn(async () => ({}))
  readonly delete = vi.fn(async () => ({}))

  constructor(
    private readonly linhas: Linhas,
    /** The collection whose read blows up — US5's error edge. */
    private readonly falha?: string,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha === args.collection) throw new Error(`leitura de ${args.collection} falhou`)
    const docs = (this.linhas[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null

  /** Every `find` this render issued for one collection. */
  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
}

/** The anonymous door, which is the only one the global avatar catalogue opens to: `avatarItem`
 *  reads are `masterOnly()`, so a signed-in maker's own client is refused there by design. */
class FakeCatalogoClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly itens: readonly unknown[] = ITENS_DO_CATALOGO) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    const docs = (args.collection === 'avatarItem' ? this.itens : []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => ({
  /** What the real `redirect()` does: it throws, and never returns. A mock that returned would
   *  let execution fall through to a render the runtime never reaches. */
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => ({ id: 7 })),
  getTenantScopedPayloadForRSC: vi.fn(),
  getPublicScopedPayloadForRSC: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))
vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const pagina = await import('../../app/(frontend)/minha-conta/page')
const { default: Page, CONTA_PATH } = pagina as {
  default: () => Promise<ReactNode>
  CONTA_PATH: string
}

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'minha-conta', 'page.tsx'),
  'utf8',
)

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth first. An intrinsic tag name or a
 *  component function — identity, so a look-alike does not satisfy the assertion. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every string the tree would print, joined. A `<style>` block is CSS, not copy: folding it in
 *  would let a class name satisfy an assertion about a message. */
function texto(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

type Render = { tree: ReactNode; db: FakeContaClient; catalogo: FakeCatalogoClient }

type OpcoesDeRender = {
  readonly linhas?: Linhas
  /** The collection whose read fails. */
  readonly falha?: string
  readonly itens?: readonly unknown[]
}

async function renderizar(opcoes: OpcoesDeRender = {}): Promise<Render> {
  const db = new FakeContaClient(opcoes.linhas ?? LINHAS_PADRAO, opcoes.falha)
  const catalogo = new FakeCatalogoClient(opcoes.itens ?? ITENS_DO_CATALOGO)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(catalogo)
  const tree = (await Page()) as ReactNode
  return { tree, db, catalogo }
}

const copia = async (opcoes: OpcoesDeRender = {}): Promise<string> => texto((await renderizar(opcoes)).tree)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue({ id: 7 })
})

describe('§1 — the route is a real screen, not a placeholder', () => {
  it('no longer renders feature 001’s stub', () => {
    expect(
      /\bPageStub\b|page-stub/.test(PAGE_SOURCE),
      'Minha Conta still renders the placeholder. FR-021 gives this route four jobs — the ' +
        'avatar, the identity, the skills panel and the maker’s own content — and a stub does none.',
    ).toBe(false)
  })

  it('knows its own path, so the screens that return here are not guessing', () => {
    expect(CONTA_PATH).toBe('/minha-conta')
  })
})

describe('§2 — who the page is for', () => {
  it('sends a signed-out visitor to login, carrying this page as the destination', async () => {
    mocks.currentUser.mockResolvedValue(null)

    await expect(renderizar()).rejects.toThrow(/NEXT_REDIRECT/)

    const destino = mocks.redirect.mock.calls[0]?.[0] as string
    expect(destino.startsWith('/login'), `a signed-out visitor was sent to ${destino}`).toBe(true)
    expect(
      destino,
      'login is reached with no destination, so FR-016’s “return to the page they came from” ' +
        'drops the person somewhere else after they sign in.',
    ).toContain(encodeURIComponent(CONTA_PATH))
  })

  it('renders a screen — never another redirect — for a signed-in person with no profile here', async () => {
    const { tree } = await renderizar({ linhas: { ...LINHAS_PADRAO, perfilMaker: [] } })

    expect(
      mocks.redirect,
      'a signed-in visitor with no profile in THIS lab was redirected. `/minha-conta/excluir` ' +
        'sends exactly that person here (CONTA_PATH), so a redirect back is a loop between two ' +
        'pages — one login may hold profiles in two labs (002 § CLR-002), and having none here ' +
        'is an ordinary state, not an error.',
    ).not.toHaveBeenCalled()
    expect(texto(tree).length, 'the page rendered nothing at all for that person').toBeGreaterThan(0)
  })

  it('reads the profile by the SIGNED-IN account, never by the lab alone', async () => {
    const { db } = await renderizar()
    const leituras = db.paraColecao('perfilMaker')

    expect(leituras, 'the page never read a profile').toHaveLength(1)
    expect(
      JSON.stringify(leituras[0]?.where ?? {}),
      'the profile read is not filtered by the signed-in account. Scoped to the lab alone it ' +
        'returns whichever profile came first, and Minha Conta then shows a stranger’s avatar, ' +
        'handle and content to whoever is logged in.',
    ).toContain('usuario')
  })
})

describe('§3 — the avatar, the name and the @handle (FR-021)', () => {
  it('prints the maker’s name and their @handle', async () => {
    const texto_ = await copia()

    expect(texto_, 'the page never prints the maker’s name').toContain(PERFIL.nome)
    expect(
      texto_,
      'the page never prints the @handle. It is derived from the name at signup (CLR-002) and ' +
        'typed nowhere else — Minha Conta is where a person finds out what theirs is, and the ' +
        'deletion screen demands they type it.',
    ).toContain(`@${PERFIL.handle}`)
  })

  it('composes the avatar from the stored configuration, through AvatarPreview', async () => {
    const { tree } = await renderizar()
    const preview = findAll(tree, AvatarPreview)

    expect(
      preview,
      'the page renders no AvatarPreview. The avatar is the first thing Minha Conta shows ' +
        '(minha-conta.md § Bloco superior), and `avatarRender` is not an alternative today: ' +
        'nothing generates that PNG until T035, so reading it would draw an empty frame.',
    ).toHaveLength(1)
    expect(
      String(preview[0]?.props.alt ?? ''),
      'the composed avatar carries no label naming its owner; it is a depiction of a person.',
    ).toContain(PERFIL.nome)

    const camadas = (preview[0]?.props.camadas ?? []) as readonly Record<string, unknown>[]
    expect(
      camadas.map((camada) => camada.slot).sort(),
      'the layers do not match the three items the stored configuration names. A preview built ' +
        'from anything but `avatarConfig` draws the same avatar for everybody.',
    ).toEqual(['cabelo', 'olhos', 'roupaCima'])
    expect(
      camadas.find((camada) => camada.slot === 'roupaCima'),
      'the layer carries no art, or the wrong art: `camadaZ` is the composition order and the ' +
        'sprite URLs come from the catalogue row, populated at depth 1.',
    ).toMatchObject({
      camadaZ: 50,
      sprite: '/media/camiseta.png',
      spriteFolhas: '/media/camiseta-folhas.png',
    })
  })

  it('asks the catalogue only for the items this maker chose', async () => {
    const { catalogo } = await renderizar()
    const leituras = catalogo.calls.filter((call) => call.collection === 'avatarItem')

    expect(leituras, 'the avatar catalogue was never read').toHaveLength(1)
    expect(
      JSON.stringify(leituras[0]?.where ?? {}),
      'the catalogue read is unfiltered: it pulls all ~93 rows to draw three. The configuration ' +
        'names the ids; the query should too.',
    ).toContain('11')
    expect(
      leituras[0]?.depth ?? 0,
      'the catalogue is read at depth 0, so `sprite` comes back as a relationship id and every ' +
        'layer is dropped for having no art (AvatarPreview § temArte).',
    ).toBeGreaterThanOrEqual(1)
  })

  it('still renders the identity when the avatar catalogue cannot be read (FR-007)', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new Error('catálogo fora do ar'))
    const db = new FakeContaClient(LINHAS_PADRAO)
    mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)

    const texto_ = texto((await Page()) as ReactNode)

    expect(
      texto_,
      'a catalogue outage took the whole page down. FR-007’s rule is that missing avatar art ' +
        'degrades the drawing and never the account.',
    ).toContain(PERFIL.nome)
  })
})

describe('§4 — the skills panel: level and pips (FR-021)', () => {
  it('renders one pip strip per ACTIVE skill, at the level the profile stores', async () => {
    const { tree } = await renderizar()
    const strips = findAll(tree, SkillPips)

    expect(
      strips.map((strip) => strip.props.level),
      'the panel does not render one SkillPips per active skill at its stored level. The two ' +
        'active skills are at 3 and 0 — and 0 is the state every new account is in (FR-013), ' +
        'so a panel that skips it is a panel nobody sees working.',
    ).toEqual([3, 0])
    expect(
      strips.map((strip) => strip.props.label),
      'the strips are unlabelled, or labelled with something other than the skill. Ten boxes ' +
        'carry no accessible name of their own.',
    ).toEqual([SKILL_ATIVA.nome, SKILL_NOVA.nome])
  })

  it('prints the level as a number beside the strip', async () => {
    const texto_ = await copia()

    expect(
      texto_,
      'the panel shows pips but never the level as text (`NÍVEL n`, minha-conta.md § Painel ' +
        'SUAS SKILLS) — a strip alone makes the reader count boxes.',
    ).toMatch(/n[ÍI]VEL\s*3/i)
    expect(texto_).toContain(SKILL_ATIVA.nome)
  })

  it('leaves out a skill the lab has retired, without touching its XP', async () => {
    const { tree } = await renderizar()

    expect(
      texto(tree),
      'the panel renders a skill whose `ativa` is false. `Skill.ts`: “Skills inativas somem do ' +
        'painel sem alterar o XP de ninguém” — the row survives precisely so the progress does, ' +
        'and the profile keeps carrying it after the team retires it.',
    ).not.toContain(SKILL_RETIRADA.nome)
    expect(findAll(tree, SkillPips)).toHaveLength(2)
  })

  it('renders no checkbox in the panel (round 5 removed it)', async () => {
    const caixas = findAll((await renderizar()).tree, 'input').filter(
      (input) => input.props.type === 'checkbox',
    )

    expect(
      caixas,
      'a checkbox survives on the skill cards. minha-conta.md § Divergências: “sobra do desenho ' +
        'antigo — sai”, and a tickable skill invites the choosing FR-013 removed from signup.',
    ).toHaveLength(0)
  })
})

describe('§5 — it displays, and never awards (FR-022)', () => {
  it('writes nothing at all while rendering', async () => {
    const { db } = await renderizar()

    expect(
      db.create,
      'Minha Conta created a row while rendering. XP, levels and missions are feature 005’s; ' +
        'this page reads.',
    ).not.toHaveBeenCalled()
    expect(
      db.update,
      'Minha Conta updated a row while rendering — a page that awards on view hands out XP on ' +
        'every refresh, and feature 005 has no ledger to reconcile it against yet.',
    ).not.toHaveBeenCalled()
    expect(db.delete).not.toHaveBeenCalled()
  })

  it('holds no write call in its source, by any door', async () => {
    expect(
      /\.(create|update|delete)\s*\(/.test(PAGE_SOURCE),
      'the page source contains a write call. FR-022 is a requirement about what this screen ' +
        'must NOT do, and a write reached through a second client would be invisible to the ' +
        'assertion above.',
    ).toBe(false)
    expect(
      /['"]use server['"]/.test(PAGE_SOURCE),
      'the page declares a server action. Nothing on Minha Conta is written in T034 — the ' +
        'avatar editor is its own route (T035) and deletion is `/minha-conta/excluir`.',
    ).toBe(false)
  })
})

describe('§5b — every screen this one is the door to (FR-023, FR-031b, US6)', () => {
  /**
   * The two routes that exist only because this page links to them.
   *
   * `/minha-conta/avatar` shipped as an **orphan**: the screen was built, its island was seated
   * in `ALLOWED_ISLANDS`, its own suite was green — and nothing in the product pointed at it.
   * Not this page, not the shell nav, not a redirect. It was reachable by typing the URL, and
   * that was the fifth finished-but-unreachable screen in this feature. US6 is explicit about
   * where the door is: *"Given a signed-in maker **on Minha Conta** / When they **open the
   * avatar editor**"* — so "open" is this page's responsibility, not the editor's.
   *
   * Asserted here, and by route rather than by label, because a page suite walks the tree the
   * page returns: a route nobody references leaves no trace in anybody's tree, which is exactly
   * why no existing assertion could have failed.
   */
  it.each([
    ['/minha-conta/avatar', 'the avatar editor (FR-023, US6)'],
    ['/minha-conta/excluir', 'the deletion screen (FR-031b)'],
  ])('links to %s — %s', async (rota) => {
    const { tree } = await renderizar()
    const destinos = findAll(tree, 'a').map((a) => String(a.props.href ?? ''))

    expect(
      destinos,
      `Minha Conta does not link to ${rota}, so the screen there is reachable only by typing ` +
        'the URL. Its own suite cannot see this: a page test walks the tree ITS page returns, ' +
        'and an unreferenced route leaves no trace in anybody’s.',
    ).toContain(rota)
  })

  it('offers the editor link as a 44px target on the compact breakpoints (FR-032b)', async () => {
    const { tree } = await renderizar()
    const editar = findAll(tree, 'a').find(
      (a) => String(a.props.href ?? '') === '/minha-conta/avatar',
    )

    expect(editar, 'no editor link to measure').toBeDefined()
    expect(
      (editar?.props.style as { minHeight?: unknown } | undefined)?.minHeight,
      'the editor link is smaller than a fingertip. CLR-009 applies 003’s FR-022 to these ' +
        'routes rather than inventing a second standard.',
    ).toBe('44px')
  })
})

describe('§6 — the maker’s own content (FR-021, US5)', () => {
  it('reads each content collection filtered by THIS profile as author', async () => {
    const { db } = await renderizar()

    for (const collection of ['artigo', 'modelo3d', 'aula']) {
      const leituras = db.paraColecao(collection)
      expect(leituras, `the page never read ${collection}`).toHaveLength(1)
      expect(
        leituras[0]?.where,
        `the ${collection} read is not filtered by the maker. Scoped to the lab alone, Minha ` +
          'Conta shows the whole lab’s output as “minhas coisas” (minha-conta.md, round 5).',
      ).toMatchObject({ autor: { equals: PERFIL.id } })
    }
  })

  it('renders the titles of the maker’s own items, drafts included', async () => {
    const texto_ = await copia()

    expect(texto_, 'the article the maker wrote is not on the page').toContain(ARTIGO.titulo)
    expect(
      texto_,
      'the maker’s unpublished model is missing. This is the person’s own account page, and ' +
        'their draft is the one place they can find it.',
    ).toContain(MODELO.titulo)
  })

  it('shows the defined empty state — with its action — for a block with nothing in it', async () => {
    const { tree } = await renderizar()
    const vazios = findAll(tree, EmptyState).filter((estado) => estado.props.variant === 'vazio')

    expect(
      vazios,
      'the `aula` block is empty and renders no EmptyState. US5’s edge: “a maker who has ' +
        'published nothing sees the defined empty state with its create action, not an empty grid”.',
    ).toHaveLength(1)
    expect(
      String((vazios[0]?.props.acao as { href?: string } | undefined)?.href ?? ''),
      'the empty state offers no way to create anything, which is the half of the edge case ' +
        'that makes it an invitation rather than a shrug.',
    ).not.toBe('')
  })
})

describe('§7 — a failed read is reported in place, with a retry (US5)', () => {
  it('reports a failed profile read instead of throwing the page away', async () => {
    const { tree } = await renderizar({ falha: 'perfilMaker' })
    const erros = findAll(tree, EmptyState).filter((estado) => estado.props.variant === 'erro')

    expect(
      erros,
      'a failed profile read produced no error state. Every 003 listing reports its outage in ' +
        'place with a retry; an unhandled throw is a 500 with no way back.',
    ).toHaveLength(1)
    expect(String((erros[0]?.props.acao as { href?: string } | undefined)?.href ?? '')).toContain(
      CONTA_PATH,
    )
  })

  it('keeps the rest of the page when one content block fails', async () => {
    const { tree } = await renderizar({ falha: 'artigo' })

    expect(
      texto(tree),
      'one failed content read took the identity down with it. The blocks are four independent ' +
        'reads, and one outage should cost one block.',
    ).toContain(PERFIL.nome)
    expect(
      findAll(tree, EmptyState).filter((estado) => estado.props.variant === 'erro'),
      'the failed block reports nothing — it is indistinguishable from a maker who has written ' +
        'no articles.',
    ).toHaveLength(1)
  })
})

describe('§8 — the page is pinned to the choke point (FR-028)', () => {
  it('reads through `lib/tenancy`, never through Payload itself', async () => {
    await renderizar()

    expect(mocks.getTenantScopedPayloadForRSC).toHaveBeenCalled()
    expect(
      /getPayload\s*\(|req\.payload|from 'payload'/.test(PAGE_SOURCE),
      'the page reaches Payload directly. FR-028 keeps every signed-in read behind ' +
        '`getTenantScopedPayload`, which is what makes the tenant constraint unforgettable.',
    ).toBe(false)
  })
})
