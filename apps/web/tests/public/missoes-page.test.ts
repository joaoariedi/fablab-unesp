import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, ProgressBar, percentOf } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'

/**
 * T032 / FR-024, US3 — the missions page: **the maker's own progress, and nobody else's**.
 *
 * FR-024 is two sentences and both are assertions here: *"A mission's progress shown to a maker
 * is **their own**; a signed-out visitor sees the mission with **no personal percentage** and an
 * invitation to sign in."*
 *
 * ── Why the fake client FILTERS instead of answering every read the same way ────────────────
 *
 * A fake that returns its rows whatever the `where` says makes "their own" unfalsifiable: a
 * page that read every submission of the lab would render the same tree as one that read its
 * own, and the suite would be green over a screen showing a lab-mate's 100% on the requester's
 * card. So `FakeLabClient` applies the `maker` constraint it is given, and the fixture carries
 * a **second maker's approved submission on a different mission** — the case that exposes the
 * difference (tasks.md § "Read before starting", item 2). Dropping the constraint turns that
 * row into a completed mission on this visitor's screen, and § 3 fails on it.
 *
 * ── Why the percentage is read through `percentOf` and not off the props ────────────────────
 *
 * `ProgressBar` takes value/max in the caller's own units precisely so the call site does not
 * round; asserting `value === 50` would pin this page to one unit and fail the day the mission
 * model gains a third step, while the *requirement* is about the percentage a maker sees.
 * `percentOf` is the component's own rounding, so the assertion reads the number the visitor
 * reads.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * The same instrument every page suite here uses (CLR-003 keeps the stack at Vitest with no
 * DOM): the page is awaited as the async function it is and the returned tree is walked.
 * Components are matched by **identity** against the same `@fablab/ui` module instance the page
 * imports, so a look-alike strip of divs cannot satisfy `ProgressBar`.
 */

/** Two published missions of this lab, populated at `depth: 1` — which is what turns `icone`
 *  from a relationship id into something drawable. */
const MISSAO_LASER = {
  id: 1,
  titulo: 'Desafio Corte Laser',
  descricao: 'Crie um chaveiro personalizado com corte a laser.',
  icone: { id: 90, url: '/media/laser.svg' },
  skill: { id: 5, nome: 'Corte a Laser' },
}

const MISSAO_3D = {
  id: 2,
  titulo: 'Impressão 3D',
  descricao: 'Modele e imprima um suporte para celular.',
  icone: { id: 91, url: '/media/impressao.svg' },
  skill: { id: 6, nome: 'Impressão 3D' },
}

const MISSAO_BORDADO = {
  id: 3,
  titulo: 'Bordado Digital',
  descricao: 'Personalize uma peça de tecido com bordado digital.',
  icone: { id: 92, url: '/media/bordado.svg' },
  skill: { id: 7, nome: 'Bordado Digital' },
}

const MISSOES = [MISSAO_LASER, MISSAO_3D, MISSAO_BORDADO]

/** The signed-in visitor's profile in THIS lab, and the lab-mate whose row must never be read
 *  onto their screen. */
const PERFIL = { id: 42, nome: 'Maria Silva', handle: 'mariasilva' }
const OUTRO_MAKER = 99

/**
 * The submissions rows the lab holds. Mine on `MISSAO_LASER` (awaiting review) and on
 * `MISSAO_BORDADO` (refused); the lab-mate's **approved** row on `MISSAO_3D`, which is the row
 * a page that forgot the maker constraint would draw as a finished mission on my card.
 */
const MINHA_ENVIADA = { id: 10, missao: MISSAO_LASER.id, maker: PERFIL.id, status: 'enviada' }
const MINHA_RECUSADA = { id: 11, missao: MISSAO_BORDADO.id, maker: PERFIL.id, status: 'recusada' }
const DO_OUTRO_APROVADA = { id: 12, missao: MISSAO_3D.id, maker: OUTRO_MAKER, status: 'aprovada' }

const SUBMISSOES = [MINHA_ENVIADA, MINHA_RECUSADA, DO_OUTRO_APROVADA]

type Where = Record<string, unknown> | undefined

/** The `{ equals }` constraint this `where` places on a field, wherever it sits in the tree —
 *  the page may nest it under `and`, and the assertion is about the constraint, not its depth. */
function equalsConstraint(where: Where, field: string): unknown {
  if (!where || typeof where !== 'object') return undefined
  const direct = (where as Record<string, { equals?: unknown } | undefined>)[field]
  if (direct && typeof direct === 'object' && 'equals' in direct) return direct.equals
  for (const chave of ['and', 'or']) {
    const ramos = (where as Record<string, unknown>)[chave]
    if (!Array.isArray(ramos)) continue
    for (const ramo of ramos) {
      const achado = equalsConstraint(ramo as Where, field)
      if (achado !== undefined) return achado
    }
  }
  return undefined
}

/** The anonymous door: the mission catalogue is public (FR-024), so this is the read that
 *  serves the signed-out visitor and the signed-in maker alike. */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(
    private readonly missoes: readonly unknown[] = MISSOES,
    private readonly falha = false,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha) throw new Error(`leitura de ${args.collection} falhou`)
    const docs = (args.collection === 'missao' ? this.missoes : []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

/**
 * The signed-in maker's own client. It **applies the `maker` constraint** — see the header.
 *
 * The write methods are spies that exist: a client missing them would let § 5 pass by
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
    private readonly perfis: readonly unknown[] = [PERFIL],
    private readonly submissoes: readonly { maker: number }[] = SUBMISSOES,
    private readonly falha?: string,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (this.falha === args.collection) throw new Error(`leitura de ${args.collection} falhou`)
    if (args.collection === 'perfilMaker') {
      const docs = this.perfis as T[]
      return { docs, totalDocs: docs.length }
    }
    if (args.collection === 'missaoSubmissao') {
      const maker = equalsConstraint(args.where as Where, 'maker')
      const docs = this.submissoes.filter(
        (linha) => maker === undefined || String(linha.maker) === String(maker),
      ) as T[]
      return { docs, totalDocs: docs.length }
    }
    return { docs: [] as T[], totalDocs: 0 }
  }

  findByID = async <T>(): Promise<T | null> => null

  paraColecao(collection: string): FindArgs[] {
    return this.calls.filter((call) => call.collection === collection)
  }
}

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => null),
  getTenantScopedPayloadForRSC: vi.fn(),
  getPublicScopedPayloadForRSC: vi.fn(),
}))

vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))
vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const pagina = await import('../../app/(frontend)/missoes/page')
const { default: Page, MISSOES_PATH, metadata } = pagina as {
  default: () => Promise<ReactElement>
  MISSOES_PATH: string
  metadata: { title?: string }
}

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'missoes', 'page.tsx'),
  'utf8',
)

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth first — identity, so a look-alike
 *  does not satisfy the assertion. */
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

/** The card whose text carries this mission's title — the unit FR-024 is written about. */
function cartaoDe(tree: ReactNode, titulo: string): AnyElement {
  const cartao = findAll(tree, 'article').find((node) => texto(node).includes(titulo))
  if (!cartao) throw new Error(`a página não renderizou um cartão para "${titulo}"`)
  return cartao
}

/** The percentage that card shows a visitor, or `null` when it shows none at all. */
function percentualDe(cartao: ReactNode): number | null {
  const barra = findAll(cartao, ProgressBar)[0]
  if (!barra) return null
  return percentOf(Number(barra.props.value), Number(barra.props.max ?? 100))
}

type Render = { tree: ReactNode; publico: FakePublicClient; lab: FakeLabClient }

type OpcoesDeRender = {
  /** `null` is the signed-out visitor — the default, because FR-024's second half is the one
   *  nothing else in this feature covers. */
  readonly sessao?: { id: string | number } | null
  readonly missoes?: readonly unknown[]
  readonly perfis?: readonly unknown[]
  readonly submissoes?: readonly { maker: number }[]
  /** The mission read blows up. */
  readonly falhaPublica?: boolean
  /** The collection of the signed-in read that blows up. */
  readonly falhaLab?: string
}

async function renderizar(opcoes: OpcoesDeRender = {}): Promise<Render> {
  const publico = new FakePublicClient(opcoes.missoes ?? MISSOES, opcoes.falhaPublica ?? false)
  const lab = new FakeLabClient(
    opcoes.perfis ?? [PERFIL],
    opcoes.submissoes ?? SUBMISSOES,
    opcoes.falhaLab,
  )
  mocks.currentUser.mockResolvedValue(opcoes.sessao ?? null)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(publico)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(lab)
  const tree = (await Page()) as ReactNode
  return { tree, publico, lab }
}

/** The signed-in maker of the fixture. */
const comoMaker = (opcoes: OpcoesDeRender = {}): Promise<Render> =>
  renderizar({ sessao: { id: 7 }, ...opcoes })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-020, FR-028)', () => {
  it('reads the missions through the anonymous choke point, naming no tenant and no status', async () => {
    const { publico } = await renderizar()

    const leitura = publico.calls.find((call) => call.collection === 'missao')
    expect(
      leitura,
      'the page never read `missao`. The catalogue is this lab\'s, and it is the one read ' +
        'FR-024\'s signed-out visitor is served by.',
    ).toBeDefined()
    // Both are the door's: `getPublicScopedPayload` fixes the tenant from the host and filters
    // `status: publicado` itself. A second opinion here is a second place to get it wrong.
    expect(JSON.stringify(leitura?.where ?? {})).not.toContain('tenant')
    expect(JSON.stringify(leitura?.where ?? {})).not.toContain('status')
  })

  it('never reaches Payload directly', () => {
    expect(PAGE_SOURCE).not.toMatch(/from ['"]payload['"]/)
    expect(PAGE_SOURCE).not.toMatch(/req\.payload/)
    expect(PAGE_SOURCE).not.toMatch(/getPayload\b/)
  })

  it('is a server component — the page ships no client bundle', () => {
    expect(
      PAGE_SOURCE.trimStart().startsWith("'use client'") ||
        PAGE_SOURCE.trimStart().startsWith('"use client"'),
      'a \'use client\' here turns the mission list into a client bundle, and the session read ' +
        'below cannot run in one at all.',
    ).toBe(false)
  })

  it('titles the document and exports its own path', () => {
    expect(metadata.title).toContain('MISSÕES')
    expect(MISSOES_PATH).toBe('/missoes')
  })
})

describe('§2 — the signed-out visitor (FR-024)', () => {
  it('shows the mission itself — title and description, exactly as the team published them', async () => {
    const { tree } = await renderizar()
    const copia = texto(tree)

    expect(copia).toContain(MISSAO_LASER.titulo)
    expect(copia).toContain(MISSAO_LASER.descricao)
  })

  it('shows NO personal percentage — no bar, and no percentage anywhere on the page', async () => {
    const { tree } = await renderizar()

    expect(
      findAll(tree, ProgressBar),
      'a signed-out visitor has no progress to show. A bar at 0% is a personal percentage ' +
        'about a person the page has not identified (FR-024).',
    ).toEqual([])
    expect(texto(tree)).not.toMatch(/\d\s*%/)
  })

  it('invites them to sign in, and comes back here afterwards', async () => {
    const { tree } = await renderizar()

    const convite = links(tree).find((link) => link.href.startsWith('/login'))
    expect(
      convite,
      'FR-024 asks for an invitation to sign in, and an invitation with no link is a sentence.',
    ).toBeDefined()
    // `/login` reads its destination from `de` — without it the visitor signs in and lands
    // somewhere that is not the mission they were reading.
    expect(convite?.href).toContain(`de=${encodeURIComponent(MISSOES_PATH)}`)
    expect(convite?.label.length).toBeGreaterThan(0)
  })

  it('reads nothing personal at all — no session, no profile, no submission', async () => {
    const { lab } = await renderizar()

    expect(mocks.getTenantScopedPayloadForRSC).not.toHaveBeenCalled()
    expect(lab.calls).toEqual([])
  })
})

describe('§3 — the signed-in maker sees THEIR OWN progress (FR-024, US3)', () => {
  it('resolves the profile from the session, never from the request', async () => {
    const { lab } = await renderizar({ sessao: { id: 7 } })

    const leitura = lab.paraColecao('perfilMaker')[0]
    expect(leitura, 'the page never read the profile, so there is nothing to attribute progress to').toBeDefined()
    expect(equalsConstraint(leitura?.where as Where, 'usuario')).toBe(7)
  })

  it('constrains the submissions read to that profile', async () => {
    const { lab } = await comoMaker()

    const leitura = lab.paraColecao('missaoSubmissao')[0]
    expect(leitura, 'the page never read `missaoSubmissao`, so no maker sees their own state').toBeDefined()
    expect(
      equalsConstraint(leitura?.where as Where, 'maker'),
      'without a `maker` constraint the page reads the whole lab\'s submissions and shows ' +
        'somebody else\'s progress on this visitor\'s screen (FR-024).',
    ).toBe(PERFIL.id)
  })

  it('shows the percentage of their own submission, and never a lab-mate\'s', async () => {
    const { tree } = await comoMaker()

    // Mine, awaiting review: the maker's half of the mission is done, the team's is not.
    expect(percentualDe(cartaoDe(tree, MISSAO_LASER.titulo))).toBe(50)
    // The lab-mate's APPROVED row sits on this mission. It is not this visitor's.
    expect(
      percentualDe(cartaoDe(tree, MISSAO_3D.titulo)),
      'this mission is complete for another maker, not for this one — the row belongs to ' +
        `perfil ${OUTRO_MAKER} (FR-024).`,
    ).toBe(0)
  })

  it('reads an approved submission of their own as a finished mission', async () => {
    const minhaAprovada = { id: 13, missao: MISSAO_3D.id, maker: PERFIL.id, status: 'aprovada' }
    const { tree } = await comoMaker({ submissoes: [...SUBMISSOES, minhaAprovada] })

    expect(percentualDe(cartaoDe(tree, MISSAO_3D.titulo))).toBe(100)
  })

  it('says where each of their submissions stands, in words and not only as a bar', async () => {
    const { tree } = await comoMaker()

    expect(texto(cartaoDe(tree, MISSAO_LASER.titulo)).toLowerCase()).toContain('aguardando')
    expect(texto(cartaoDe(tree, MISSAO_BORDADO.titulo)).toLowerCase()).toContain('recusado')
  })

  it('does not invite a signed-in maker to sign in', async () => {
    const { tree } = await comoMaker()

    expect(links(tree).filter((link) => link.href.startsWith('/login'))).toEqual([])
  })

  it('renders the missions with no personal percentage when the maker has no profile in this lab', async () => {
    const { tree } = await comoMaker({ perfis: [] })

    expect(texto(tree)).toContain(MISSAO_LASER.titulo)
    expect(findAll(tree, ProgressBar)).toEqual([])
  })

  it('keeps the catalogue on screen when the personal read fails', async () => {
    const { tree } = await comoMaker({ falhaLab: 'missaoSubmissao' })

    expect(texto(tree)).toContain(MISSAO_LASER.titulo)
    expect(findAll(tree, ProgressBar)).toEqual([])
  })
})

describe('§4 — the submit control is BOUND (US3, tasks.md preamble item 1)', () => {
  it('offers the maker a way to submit, pointing at a door that exists', async () => {
    const { tree } = await comoMaker()

    const envio = links(cartaoDe(tree, MISSAO_3D.titulo)).find((link) =>
      link.href.includes('missaoSubmissao'),
    )
    expect(
      envio,
      'a mission this maker has not submitted offers no way to submit it. A page whose only ' +
        'control is a heading is the "module with tests and no caller" failure at the surface.',
    ).toBeDefined()
    expect(envio?.href.length).toBeGreaterThan(0)
    expect(envio?.label.length).toBeGreaterThan(0)
  })

  it('leads a rejected submission back to its OWN row, so CLR-015 can reopen it', async () => {
    const { tree } = await comoMaker()

    const reenvio = links(cartaoDe(tree, MISSAO_BORDADO.titulo)).find((link) =>
      link.href.includes('missaoSubmissao'),
    )
    expect(reenvio, 'a refused submission offers no way back, which is the permanent bar CLR-015 refuses').toBeDefined()
    expect(
      reenvio?.href,
      'a rejected row is REOPENED, never replaced: a second create is refused by the ' +
        '(missao, maker) unique index (FR-023).',
    ).toContain(String(MINHA_RECUSADA.id))
  })

  it('offers the signed-out visitor no submit control at all', async () => {
    const { tree } = await renderizar()

    expect(links(tree).filter((link) => link.href.includes('missaoSubmissao'))).toEqual([])
  })

  it('offers no second submit control on a mission already awaiting review', async () => {
    const { tree } = await comoMaker()

    expect(
      links(cartaoDe(tree, MISSAO_LASER.titulo)).filter((link) => link.href.includes('/create')),
      'one submission per mission per maker, forever (FR-023) — a second create is refused by ' +
        'the unique index, so offering it is a button whose only outcome is an error.',
    ).toEqual([])
  })
})

describe('§5 — it displays; it never awards (FR-022)', () => {
  it('writes nothing, by any door', async () => {
    const { lab } = await comoMaker()

    expect(lab.create).not.toHaveBeenCalled()
    expect(lab.update).not.toHaveBeenCalled()
    expect(lab.delete).not.toHaveBeenCalled()
  })
})

describe('§6 — the two states a catalogue can be in', () => {
  it('reports an empty catalogue as empty, not as an error', async () => {
    const { tree } = await renderizar({ missoes: [] })

    const vazio = findAll(tree, EmptyState)[0]
    expect(vazio).toBeDefined()
    expect(vazio?.props.variant).toBe('vazio')
  })

  it('reports a failed read in place, with a retry', async () => {
    const { tree } = await renderizar({ falhaPublica: true })

    const erro = findAll(tree, EmptyState)[0]
    expect(erro).toBeDefined()
    expect(erro?.props.variant).toBe('erro')
  })
})

/**
 * T018 / FR-007 — **the arithmetic is expressed once, and this page is one of the two readers.**
 *
 * FR-007: *"The arithmetic is expressed once and shared with `/missoes`, never restated."* Until
 * T015/T017 this page owned `ETAPAS_DA_MISSAO`, `ETAPAS_POR_ESTADO`, `estadoDe`, `estadoPessoal`
 * and `submissoesDoMaker` outright, and the Home's band needed the same curve. Two pages
 * importing each other's page module is not an option, so the shared modules are the only shape
 * in which "expressed once" is literally true.
 *
 * ── Why the first test MOCKS the shared model instead of reading the page's source ───────────
 *
 * A source-text assertion proves the import statement is written; it cannot prove the imported
 * value is the one that reaches `ProgressBar`. A page that imported `ETAPAS_DA_MISSAO` and then
 * went on using its own local `2` would satisfy every grep and still be a second copy, free to
 * disagree with the Home the day the model gains a step. So the model is replaced with a
 * three-of-four scale and the rendered percentage is read back: 75%, which is a number no
 * literal in this page could produce. That is the difference between "imports it" and "uses it".
 *
 * The page is re-imported under `vi.resetModules()` for that one test, and `@fablab/ui` with it,
 * because `findAll` matches components by **identity** — a `ProgressBar` from the outer module
 * instance would not match the one the re-imported page renders, and the assertion would pass
 * vacuously by finding no bar at all.
 */
describe('§7 — the two-step model is SHARED, not restated (FR-007, T018)', () => {
  /** The model, mutated: four steps, and a submission awaiting review worth three of them. No
   *  literal in this page can produce 75%, which is the whole point of the number. */
  const MODELO_MUTADO = { ETAPAS_DA_MISSAO: 4, ETAPAS_POR_ESTADO: { enviada: 3, aprovada: 4, recusada: 0 } }

  async function renderizarComModeloMutado(): Promise<{
    tree: ReactNode
    ui: typeof import('@fablab/ui')
  }> {
    vi.resetModules()
    vi.doMock('../../lib/content/missoes', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../lib/content/missoes')>()),
      ...MODELO_MUTADO,
    }))
    try {
      // Imported AFTER the reset, so the page and this test walk the same module instances.
      const ui = await import('@fablab/ui')
      const { default: PaginaMutada } = (await import('../../app/(frontend)/missoes/page')) as {
        default: () => Promise<ReactElement>
      }
      mocks.currentUser.mockResolvedValue({ id: 7 })
      mocks.getPublicScopedPayloadForRSC.mockResolvedValue(new FakePublicClient())
      mocks.getTenantScopedPayloadForRSC.mockResolvedValue(new FakeLabClient())
      return { tree: (await PaginaMutada()) as ReactNode, ui }
    } finally {
      vi.doUnmock('../../lib/content/missoes')
      vi.resetModules()
    }
  }

  it('draws the bar from `lib/content/missoes`, not from a literal of its own', async () => {
    const { tree, ui } = await renderizarComModeloMutado()

    const barra = findAll(cartaoDe(tree, MISSAO_LASER.titulo), ui.ProgressBar)[0]
    expect(
      barra,
      'the maker\'s own `enviada` submission drew no bar at all — the tree walked here is not ' +
        'the one the page renders.',
    ).toBeDefined()
    expect(
      ui.percentOf(Number(barra?.props.value), Number(barra?.props.max ?? 100)),
      'the page still owns its own copy of the arithmetic: the shared model was moved to a ' +
        'three-of-four scale and this page kept answering 50%. FR-007 asks for one expression ' +
        'of it, shared with the Home\'s band — a second copy is a second model free to disagree.',
    ).toBe(75)
  })

  it('imports the model and the personal reader instead of restating either', () => {
    expect(PAGE_SOURCE, 'the pure model lives in `lib/content/missoes.ts` (T015)').toMatch(
      /from '\.\.\/\.\.\/\.\.\/lib\/content\/missoes'/,
    )
    expect(PAGE_SOURCE, 'the RSC reader lives in `lib/public/missoes.ts` (T017)').toMatch(
      /from '\.\.\/\.\.\/\.\.\/lib\/public\/missoes'/,
    )

    // Anchored at the start of a line so the docblocks may keep NAMING these — the explanation
    // of where the model went is exactly what a future reader needs, and a guard that can only
    // be satisfied by deleting the explanation is a guard that gets deleted instead.
    for (const declaracao of [
      /^const ETAPAS_DA_MISSAO\b/m,
      /^const ETAPAS_POR_ESTADO\b/m,
      /^function estadoDe\b/m,
      /^async function estadoPessoal\b/m,
      /^async function submissoesDoMaker\b/m,
      /^type EstadoPessoal\b/m,
    ]) {
      expect(PAGE_SOURCE, `${String(declaracao)} is a second copy of something T015/T017 own`).not.toMatch(
        declaracao,
      )
    }
  })
})
