import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, Pagination, SearchInput } from '@fablab/ui'

import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T023 / FR-008, FR-010, FR-024, FR-027, US5 — the Calendário.
 *
 * `spec.md` FR-008: *"Calendário: month grid and list view, period navigation, type and machine
 * filters, day panel"*. US5 fixes the two failure shapes: *"a day with more than three events
 * shows `+ N mais` and opens that day's panel"* and *"a month with no events shows the empty
 * state for that month and keeps the navigation usable, so the visitor can reach a month that
 * has some"*.
 *
 * ── What this file proves that no other listing test does ───────────────────────────────────
 *
 * 1. **The agenda is read by PERIOD, not by page.** `listPublic` sorts `-inicioEm` and takes
 *    twelve rows; a month grid needs *the month*, ascending, whatever its size. So this page
 *    issues its own range read through the same anonymous choke point, and §1 asserts the
 *    range, the order and the absence of any status clause of the page's own.
 * 2. **`evento`'s status set is not the three-state queue.** `Evento.ts`: *"`status` is
 *    `rascunho · publicado · cancelado · concluido`, not the three-state review queue"*, and
 *    `spec.md` § Notes for planning: *"A cancelled event that was public must keep showing as
 *    cancelled rather than vanishing"*. §6 hands the page a `cancelado` document and requires
 *    it to be drawn, struck through and labelled — never filtered out by the renderer.
 * 3. **The day panel is the page's one island.** Everything else here navigates by link — the
 *    view switch, the period arrows, the type chips and the pagination — which is what keeps a
 *    calendar a server component (FR-024). The drawer opens and closes in place, so it is the
 *    one thing that cannot.
 */

const ROUTE_DIR = join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'calendario')
const PAGE_SOURCE = join(ROUTE_DIR, 'page.tsx')

/** The day panel island, at the path `packages/ui/tests/islands.test.ts` already reserves for
 *  it in `ALLOWED_ISLANDS` — an island at any other path fails that audit. */
const ISLAND_SOURCE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'components',
  'CalendarDayPanel.tsx',
)

/** This organization's machines, as the `publicList` declaration on `maquina` allows a page to
 *  enumerate them: *"the Calendário machine filter is a select of every machine in the lab"*. */
const MAQUINAS = [
  { id: 3, nome: 'Corte a Laser' },
  { id: 4, nome: 'Impressoras 3D' },
]

/** One published event, populated at `depth: 1` exactly as the scoped client returns it.
 *  14:00–17:00 in São Paulo is 17:00–20:00Z: the fixtures are written in UTC on purpose, so a
 *  page that forgot the lab's timezone would put them on the wrong day. */
const EVENTO = {
  id: 20,
  titulo: 'Oficina de corte a laser',
  slug: 'oficina-de-corte-a-laser',
  tipo: 'oficina',
  descricaoCurta: 'Aprenda a operar a cortadora e leve sua primeira peça pronta.',
  inicioEm: '2026-08-22T17:00:00.000Z',
  fimEm: '2026-08-22T20:00:00.000Z',
  local: { id: 1, nome: 'Fab Lab CITe — Sala 2' },
  maquinas: [{ id: 3, nome: 'Corte a Laser' }],
  responsavel: { id: 9, nome: 'Maria Silva', handle: 'mariasilva' },
  vagasTotal: 20,
  status: 'publicado',
  curtidas: 7,
}

/** `n` events on one day, each distinguishable in an assertion. */
const eventosNoDia = (dia: string, quantidade: number): Record<string, unknown>[] =>
  Array.from({ length: quantidade }, (_, i) => ({
    ...EVENTO,
    id: 100 + i,
    slug: `evento-${String(i + 1)}`,
    titulo: `Evento ${String(i + 1)}`,
    // Minutes, not hours: fifteen events an hour apart would run past midnight and land on the
    // next day, which is a fixture describing something other than "a busy Saturday".
    inicioEm: `${dia}T17:${String(i * 3).padStart(2, '0')}:00.000Z`,
    fimEm: `${dia}T18:${String(i * 3).padStart(2, '0')}:00.000Z`,
  }))

/**
 * The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove both
 * reads go through the choke point and that neither carries a status clause the page invented.
 */
class FakePublicClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(
    private readonly eventos: readonly Record<string, unknown>[],
    private readonly falhaEventos: Error | null = null,
  ) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    if (args.collection === 'maquina') return { docs: MAQUINAS as T[], totalDocs: MAQUINAS.length }
    if (this.falhaEventos !== null) throw this.falhaEventos
    return { docs: this.eventos as T[], totalDocs: this.eventos.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. Modelling that is
   *  load-bearing — a mock that returns lets execution fall through to a render the runtime
   *  would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const pageModule = await import('../../app/(frontend)/calendario/page')
const CalendarioPage = pageModule.default as (props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) => Promise<ReactElement>

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth-first. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every element in the tree, whatever its type. */
function everyElement(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap(everyElement)
  if (!isElement(node)) return []
  return [node, ...everyElement((node.props.children ?? null) as ReactNode)]
}

/** Every string in the tree, joined — what a reader would see, ignoring the markup around it. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isElement(node)) return ''
  return textOf((node.props.children ?? null) as ReactNode)
}

type Rendered = { tree: ReactNode; client: FakePublicClient }

async function render(
  query: Record<string, string | string[] | undefined> = {},
  eventos: readonly Record<string, unknown>[] = [EVENTO],
  falha: Error | null = null,
): Promise<Rendered> {
  const client = new FakePublicClient(eventos, falha)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
  const tree = (await CalendarioPage({ searchParams: Promise.resolve(query) })) as unknown as ReactNode
  return { tree, client }
}

/** The `find` this page issued for one collection. */
const chamada = (client: FakePublicClient, collection: string): FindArgs | undefined =>
  client.calls.find((call) => call.collection === collection)

/** One month cell, addressed by the day it draws. */
const celula = (tree: ReactNode, dia: string): AnyElement | undefined =>
  everyElement(tree).find((node) => node.props['data-dia'] === dia)

/** The nav whose accessible name contains `nome`, however the page marked it up. */
const navChamada = (tree: ReactNode, nome: string): AnyElement | undefined =>
  findAll(tree, 'nav').find((node) =>
    String(node.props['aria-label'] ?? '').toLowerCase().includes(nome),
  )

const linksDe = (node: ReactNode): AnyElement[] => findAll(node, 'a')

const hrefDe = (node: AnyElement | undefined): string => String(node?.props.href ?? '')

/** The link inside `node` whose visible text contains `rotulo`, case-insensitively. */
const linkComTexto = (node: ReactNode, rotulo: string): AnyElement | undefined =>
  linksDe(node).find((link) => textOf(link).toUpperCase().includes(rotulo.toUpperCase()))

const selectNamed = (tree: ReactNode, name: string): AnyElement | undefined =>
  findAll(tree, 'select').find((node) => node.props.name === name)

/** The day drawer, found by component name rather than by identity: the page composes the
 *  island from `@fablab/ui`, and this file must not need the export to exist in order to
 *  report the page's own behaviour as missing. */
const painelDia = (tree: ReactNode): AnyElement | undefined =>
  everyElement(tree).find(
    (node) => typeof node.type === 'function' && (node.type as { name?: string }).name === 'CalendarDayPanel',
  )

/**
 * A month far enough from this one that neither it nor its neighbours is the current month.
 *
 * The page omits `?mes=` when a link points at the month it is *now* — that is what gives the
 * agenda one canonical URL instead of two, and what makes `HOJE` expressible as a link. A test
 * that hard-coded `2026-08` would therefore assert `mes=2026-09` on the next-month arrow and
 * fail for one month in every twelve, on a rule it was not written to be about.
 */
function periodoDistante(passos: number): { ano: number; mes: number } {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const total = agora.getUTCFullYear() * 12 + agora.getUTCMonth() + passos
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 }
}

const chaveMes = ({ ano, mes }: { ano: number; mes: number }): string =>
  `${String(ano)}-${String(mes).padStart(2, '0')}`

const MESES_PT = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
]

const rotuloMes = ({ ano, mes }: { ano: number; mes: number }): string =>
  `${MESES_PT[mes - 1]} ${String(ano)}`

beforeEach(() => {
  vi.clearAllMocks()
})

describe('§1 — the read path (FR-002, FR-008, US5)', () => {
  it('reads the requested month by period, ascending, through the anonymous choke point', async () => {
    const { client } = await render({ mes: '2026-08' })

    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
    const leitura = chamada(client, 'evento')
    expect(leitura, 'the page issued no read of the agenda at all').toBeDefined()
    // Ascending: a calendar reads forwards through the month, where every other listing reads
    // most-recent-first (CLR-007). `-inicioEm` here would draw the list view backwards.
    expect(leitura?.sort).toBe('inicioEm')
    // `depth: 1` populates local, máquinas and responsável — the card's metadata row — without
    // any of those collections being publicly listable.
    expect(leitura?.depth).toBe(1)
  })

  it('bounds the read to the month, in the lab timezone', async () => {
    const { client } = await render({ mes: '2026-08' })
    const where = JSON.stringify(chamada(client, 'evento')?.where)

    // August in São Paulo starts at 00:00-03:00 on the 1st and ends when September starts. A
    // page that used UTC midnight would pull in the last three hours of July.
    expect(where).toContain('2026-08-01T00:00:00.000-03:00')
    expect(where).toContain('2026-09-01T00:00:00.000-03:00')
  })

  it('adds no status clause of its own — the choke point owns that predicate', async () => {
    const { client } = await render({ mes: '2026-08' })

    // `evento` has four states where the other collections have three, so a page-level
    // "published only" is a second opinion about what public means — and the day the two
    // disagree is the day a cancelled event silently vanishes from the agenda.
    //
    // This assertion was true when it was written and did not buy what it claimed: the choke
    // point applied `{ status: { equals: 'publicado' } }` to every publishable collection, so
    // `cancelado` and `concluido` were dropped one layer BELOW this page and §6's fixtures were
    // testing a document the real read path could not produce. The predicate now widens for
    // `evento` — `tests/tenancy/public-payload.test.ts` § "shows a cancelled or concluded
    // event" asserts it at the gate, and § "still hides a draft event" asserts the direction
    // that could leak. What is asserted HERE is only the page's half: that it adds nothing.
    expect(JSON.stringify(chamada(client, 'evento')?.where)).not.toContain('status')
  })

  it('reads this organization\'s machines for the filter select', async () => {
    const { client } = await render({ mes: '2026-08' })
    const leitura = chamada(client, 'maquina')

    expect(leitura, 'the machine select was drawn from something other than the tenant').toBeDefined()
    expect(leitura?.depth).toBe(0)
  })

  it('narrows the read by type, machine and search term', async () => {
    const { client } = await render({
      mes: '2026-08',
      tipo: ['oficina', 'mutirao'],
      maquina: '3',
      busca: 'laser',
    })
    const where = JSON.stringify(chamada(client, 'evento')?.where)

    expect(where).toContain('"tipo":{"in":["oficina","mutirao"]}')
    expect(where).toContain('"maquinas":{"in":["3"]}')
    expect(where).toContain('"titulo":{"like":"laser"}')
  })

  it('ignores a type nobody defined rather than querying it', async () => {
    const { client } = await render({ mes: '2026-08', tipo: ['oficina', 'churrasco'] })

    // The same narrowing `params.ts` applies to an unknown category: a stale link is not an
    // error a visitor can act on, and the six types are a fixed vocabulary.
    expect(JSON.stringify(chamada(client, 'evento')?.where)).not.toContain('churrasco')
  })

  it('is a 404 for the whole site when the host resolves to no organization', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nowhere.test'))

    await expect(CalendarioPage({ searchParams: Promise.resolve({}) })).rejects.toBe(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalled()
  })
})

describe('§2 — the month grid (FR-008, US5)', () => {
  it('draws seven weekday headers, starting on Monday', async () => {
    const { tree } = await render({ mes: '2026-08' })
    const texto = textOf(tree)

    for (const dia of ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']) {
      expect(texto, `the grid has no ${dia} column header`).toContain(dia)
    }
  })

  it('draws whole weeks — every cell of the month plus the days that complete its rows', async () => {
    const { tree } = await render({ mes: '2026-08' })
    const celulas = everyElement(tree).filter((node) => typeof node.props['data-dia'] === 'string')

    expect(celulas.length % 7, 'a month grid that is not whole weeks has a ragged row').toBe(0)
    // 1 August 2026 is a Saturday and August has 31 days: six rows.
    expect(celulas.length).toBe(42)
    expect(celula(tree, '2026-08-22')).toBeDefined()
    // The days from the neighbouring months that complete the first and last rows are drawn,
    // so the grid is a rectangle rather than a shape with holes in it.
    expect(celula(tree, '2026-07-31')).toBeDefined()
  })

  it('places an event on its São Paulo day, not its UTC one', async () => {
    // 23:30Z on the 22nd is 20:30 on the 22nd in São Paulo; 02:30Z on the 23rd is 23:30 on the
    // 22nd. Both belong to the 22nd on this agenda, and a UTC page puts the second on the 23rd.
    const { tree } = await render({ mes: '2026-08' }, [
      { ...EVENTO, id: 1, titulo: 'Noturna', inicioEm: '2026-08-23T02:30:00.000Z', fimEm: '2026-08-23T03:30:00.000Z' },
    ])

    expect(textOf(celula(tree, '2026-08-22'))).toContain('Noturna')
    expect(textOf(celula(tree, '2026-08-23'))).not.toContain('Noturna')
  })

  it('shows at most three pills in a cell and offers the rest as + N mais', async () => {
    const { tree } = await render({ mes: '2026-08' }, eventosNoDia('2026-08-22', 5))
    const cell = celula(tree, '2026-08-22')

    const texto = textOf(cell)
    expect(texto).toContain('Evento 1')
    expect(texto).toContain('Evento 3')
    // The fourth and fifth are behind the counter, which is what US5's edge case asks for.
    expect(texto).not.toContain('Evento 4')
    expect(texto).toContain('+ 2 mais')
    // …and the counter opens that day's panel rather than being a label.
    expect(hrefDe(linkComTexto(cell, '+ 2 mais'))).toContain('dia=2026-08-22')
  })

  it('shows no counter on a day whose events all fit', async () => {
    const { tree } = await render({ mes: '2026-08' }, eventosNoDia('2026-08-22', 3))

    expect(textOf(celula(tree, '2026-08-22'))).not.toContain('mais')
  })
})

describe('§3 — the list view (FR-008, US5)', () => {
  it('groups the month by day, in ascending order, with a day heading', async () => {
    const { tree } = await render({ visao: 'lista', mes: '2026-08' }, [
      { ...EVENTO, id: 2, titulo: 'Depois', inicioEm: '2026-08-25T17:00:00.000Z', fimEm: '2026-08-25T18:00:00.000Z' },
      { ...EVENTO, id: 1, titulo: 'Antes', inicioEm: '2026-08-22T17:00:00.000Z', fimEm: '2026-08-22T18:00:00.000Z' },
    ])
    const texto = textOf(tree)

    // "22 SÁB · AGOSTO" — the day header of `calendario.md` § Visão LISTA.
    expect(texto).toContain('22 SÁB')
    expect(texto).toContain('25 TER')
    expect(texto.indexOf('Antes')).toBeLessThan(texto.indexOf('Depois'))
  })

  it('draws the card metadata the page spec fixes', async () => {
    const { tree } = await render({ visao: 'lista', mes: '2026-08' })
    const texto = textOf(tree)

    expect(texto).toContain('OFICINA')
    expect(texto).toContain('Oficina de corte a laser')
    expect(texto).toContain('Aprenda a operar a cortadora')
    expect(texto).toContain('14:00')
    expect(texto).toContain('17:00')
    expect(texto).toContain('Fab Lab CITe — Sala 2')
    expect(texto).toContain('Corte a Laser')
    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('@mariasilva')
    expect(texto).toContain('20 vagas')
  })

  it('paginates the list view and leaves the month grid to the period navigation', async () => {
    const { tree } = await render({ visao: 'lista', mes: '2026-08' }, eventosNoDia('2026-08-10', 15))
    const paginacao = findAll(tree, Pagination)

    // CLR-003's numbered control, on the one view it makes sense for (plan § Risks): fifteen
    // events is two pages of twelve.
    expect(paginacao.length).toBe(1)
    expect(paginacao[0]?.props.totalPages).toBe(2)
    expect(String(paginacao[0]?.props.hrefFor)).toBeDefined()
  })

  it('renders no numbered control on the month grid', async () => {
    const { tree } = await render({ visao: 'mes', mes: '2026-08' }, eventosNoDia('2026-08-10', 15))

    expect(findAll(tree, Pagination)).toEqual([])
  })
})

describe('§4 — period navigation and the view switch (FR-008, FR-010)', () => {
  it('moves a month at a time and keeps the filters on', async () => {
    const periodo = periodoDistante(6)
    const { tree } = await render({ mes: chaveMes(periodo), tipo: ['oficina'], busca: 'laser' })
    const nav = navChamada(tree, 'período')

    expect(nav, 'the page draws no period navigation').toBeDefined()
    expect(textOf(nav)).toContain(rotuloMes(periodo))

    const anterior = linksDe(nav)[0]
    const proximo = linksDe(nav).find((link) => hrefDe(link).includes(chaveMes(periodoDistante(7))))
    expect(hrefDe(anterior)).toContain(`mes=${chaveMes(periodoDistante(5))}`)
    expect(hrefDe(proximo)).toContain(`mes=${chaveMes(periodoDistante(7))}`)
    // A filter dropped by the arrow is a filter the visitor has to set again every month.
    expect(hrefDe(proximo)).toContain('tipo=oficina')
    expect(hrefDe(proximo)).toContain('busca=laser')
  })

  it('names the month it is showing, in Portuguese', async () => {
    const { tree } = await render({ mes: '2026-08' })

    // The label is the one period assertion that can be spelled out: it depends on the URL and
    // not on today, so a fixed month is exactly right here.
    expect(textOf(navChamada(tree, 'período'))).toContain('AGOSTO 2026')
  })

  it('rolls the year over rather than writing a thirteenth month', async () => {
    // December two years out: never the current month, so `?mes=` is never omitted from either
    // arrow, and January of the following year is what "next" has to mean.
    const dezembro = { ano: periodoDistante(0).ano + 2, mes: 12 }
    const { tree } = await render({ mes: chaveMes(dezembro) })
    const nav = navChamada(tree, 'período')

    expect(textOf(nav)).toContain(rotuloMes(dezembro))
    expect(linksDe(nav).map(hrefDe).join(' ')).toContain(`mes=${String(dezembro.ano + 1)}-01`)
  })

  it('offers HOJE, which drops the period and keeps everything else', async () => {
    const { tree } = await render({ mes: chaveMes(periodoDistante(6)), busca: 'laser' })
    const hoje = linkComTexto(navChamada(tree, 'período'), 'HOJE')

    expect(hoje, 'there is no way back to the current month').toBeDefined()
    expect(hrefDe(hoje)).not.toContain('mes=')
    expect(hrefDe(hoje)).toContain('busca=laser')
  })

  it('switches views by link, so neither view needs a client boundary', async () => {
    const { tree } = await render({ mes: '2026-08', visao: 'lista' })
    const nav = navChamada(tree, 'visualização')

    expect(nav, 'the page draws no view switcher').toBeDefined()
    expect(hrefDe(linkComTexto(nav, 'MÊS'))).toContain('visao=mes')
    expect(hrefDe(linkComTexto(nav, 'LISTA'))).toContain('visao=lista')
    // The active one is marked for a screen reader, not only in colour.
    expect(linkComTexto(nav, 'LISTA')?.props['aria-current']).toBe('page')
  })

  it('falls back to the current month when the URL carries nonsense', async () => {
    const { client } = await render({ mes: 'agosto' })
    const agora = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7)

    expect(JSON.stringify(chamada(client, 'evento')?.where)).toContain(`${agora}-01T00:00:00.000-03:00`)
  })
})

describe('§5 — the type and machine filters (FR-008, FR-010)', () => {
  it('offers the six types as links that toggle, plus TODOS', async () => {
    const { tree } = await render({ mes: '2026-08', tipo: ['oficina'] })
    const nav = navChamada(tree, 'tipo')

    expect(nav, 'the page draws no type filter').toBeDefined()
    const texto = textOf(nav)
    for (const rotulo of ['TODOS', 'OFICINA', 'AULA PRESENCIAL', 'MUTIRÃO', 'MANUTENÇÃO', 'EVENTO ABERTO', 'PRAZO DE MISSÃO']) {
      expect(texto, `the type filter has no ${rotulo} chip`).toContain(rotulo)
    }

    // Multi-selection: a second type is added to the set rather than replacing it.
    expect(hrefDe(linkComTexto(nav, 'MUTIRÃO'))).toContain('tipo=oficina&tipo=mutirao')
    // The active one un-selects, which is the only way back with no client boundary.
    expect(hrefDe(linkComTexto(nav, 'OFICINA'))).not.toContain('tipo=oficina')
    expect(hrefDe(linkComTexto(nav, 'TODOS'))).not.toContain('tipo=')
  })

  it('draws the machine select from the tenant\'s own machines', async () => {
    const { tree } = await render({ mes: '2026-08', maquina: '3' })
    const select = selectNamed(tree, 'maquina')

    expect(select, 'the page draws no machine filter').toBeDefined()
    const texto = textOf(select)
    expect(texto).toContain('Todas as máquinas')
    expect(texto).toContain('Corte a Laser')
    expect(texto).toContain('Impressoras 3D')
    // Opened on the value the URL carries, so a filtered link renders as filtered.
    expect(select?.props.defaultValue).toBe('3')
  })

  it('submits the filters as a GET form that keeps the period and the type chips', async () => {
    const { tree } = await render({ mes: '2026-08', tipo: ['oficina'] })
    const form = findAll(tree, 'form')[0]

    expect(form?.props.method).toBe('get')
    expect(form?.props.action).toBe('/calendario')
    expect(findAll(tree, SearchInput).length).toBe(1)
    // A GET form submits only its own fields, so without these the month and the chips are
    // silently reset by a search.
    const escondidos = findAll(form, 'input').filter((node) => node.props.type === 'hidden')
    const pares = escondidos.map((node) => `${String(node.props.name)}=${String(node.props.value)}`)
    expect(pares).toContain('mes=2026-08')
    expect(pares).toContain('tipo=oficina')
  })
})

describe('§6 — evento is not the three-state queue (FR-008, spec § Notes for planning)', () => {
  it('keeps a cancelled event on the agenda, labelled and struck through', async () => {
    const cancelado = { ...EVENTO, id: 30, titulo: 'Mutirão cancelado', status: 'cancelado' }
    const { tree } = await render({ visao: 'lista', mes: '2026-08' }, [cancelado])

    // *"A cancelled event that was public must keep showing as cancelled rather than
    // vanishing"* — the renderer drops nothing on `status`.
    expect(textOf(tree)).toContain('Mutirão cancelado')
    expect(textOf(tree)).toContain('CANCELADO')
    const titulo = everyElement(tree).find((node) => textOf(node) === 'Mutirão cancelado')
    expect(titulo?.props.style?.textDecoration).toBe('line-through')
  })

  it('draws a cancelled event in the month grid too', async () => {
    const cancelado = { ...EVENTO, id: 31, titulo: 'Mutirão cancelado', status: 'cancelado' }
    const { tree } = await render({ visao: 'mes', mes: '2026-08' }, [cancelado])

    expect(textOf(celula(tree, '2026-08-22'))).toContain('Mutirão cancelado')
  })

  it('derives the other labels from the dates, never from status', async () => {
    const concluido = {
      ...EVENTO,
      id: 32,
      status: 'concluido',
      inicioEm: '2026-08-02T17:00:00.000Z',
      fimEm: '2026-08-02T20:00:00.000Z',
    }
    const { tree } = await render({ visao: 'lista', mes: '2026-08' }, [concluido])

    // `ENCERRADO` comes from `fimEm` being in the past (`calendario.md` § Modelo de conteúdo:
    // *"só CANCELADO vem deste campo"*), so a `concluido` event is not labelled cancelled.
    expect(textOf(tree)).toContain('ENCERRADO')
    expect(textOf(tree)).not.toContain('CANCELADO')
  })
})

describe('§7 — the day panel island (FR-008, FR-024, US5)', () => {
  it('exists at the path the island audit reserves for it, and is a client component', async () => {
    expect(existsSync(ISLAND_SOURCE), 'packages/ui/src/components/CalendarDayPanel.tsx is missing').toBe(true)
    const fonte = readFileSync(ISLAND_SOURCE, 'utf8')
    expect(fonte.trimStart().startsWith("'use client'")).toBe(true)
    // The audit's second rule: a directive over a component with no interactivity ships a
    // bundle for markup the server could have emitted.
    expect(fonte).toMatch(/useState|useEffect/)
  })

  it('opens the requested day with that day\'s events', async () => {
    const { tree } = await render({ mes: '2026-08', dia: '2026-08-22' }, eventosNoDia('2026-08-22', 4))
    const painel = painelDia(tree)

    expect(painel, 'the day panel did not open for ?dia=').toBeDefined()
    // "SÁBADO, 22 DE AGOSTO" — the date in full, as `calendario.md` § Painel lateral fixes it.
    expect(String(painel?.props.titulo ?? '').toUpperCase()).toContain('SÁBADO, 22 DE AGOSTO')
    const texto = textOf(painel)
    // The WHOLE day, not the three the cell had room for.
    expect(texto).toContain('Evento 1')
    expect(texto).toContain('Evento 4')
    // …and a way out that works with no JavaScript at all.
    expect(String(painel?.props.fecharHref ?? '')).not.toContain('dia=')
  })

  it('opens no panel when the URL asks for no day', async () => {
    const { tree } = await render({ mes: '2026-08' })

    expect(painelDia(tree)).toBeUndefined()
  })

  it('is the page\'s only client boundary', async () => {
    const fonte = readFileSync(PAGE_SOURCE, 'utf8')

    // FR-024: the view switch, the arrows, the chips and the pagination are links, so the page
    // module itself ships no JavaScript.
    expect(fonte.trimStart().startsWith("'use client'")).toBe(false)
  })
})

describe('§8 — the empty and error states (FR-017, FR-018, US5)', () => {
  it('names the month it found nothing in and keeps the navigation usable', async () => {
    const periodo = periodoDistante(6)
    const { tree } = await render({ mes: chaveMes(periodo) }, [])
    const vazio = findAll(tree, EmptyState)[0]

    expect(vazio?.props.variant).toBe('vazio')
    expect(String(vazio?.props.titulo)).toContain(rotuloMes(periodo))
    // US5's error case: the way out of an empty month is the next one.
    expect(String((vazio?.props.acao as { href?: string })?.href)).toContain(
      `mes=${chaveMes(periodoDistante(7))}`,
    )
    // The navigation survives the empty state, or the visitor cannot reach a month with events.
    expect(navChamada(tree, 'período')).toBeDefined()
  })

  it('offers to clear the filters when they are what emptied the month', async () => {
    const { tree } = await render({ mes: '2026-08', tipo: ['oficina'], busca: 'laser' }, [])
    const vazio = findAll(tree, EmptyState)[0]

    expect(String(vazio?.props.titulo).toLowerCase()).toContain('filtros')
    const limpar = String((vazio?.props.acao as { href?: string })?.href)
    expect(limpar).toContain('mes=2026-08')
    expect(limpar).not.toContain('tipo=')
    expect(limpar).not.toContain('busca=')
  })

  it('reports a failed read in place, with a retry that keeps the URL that broke', async () => {
    const { tree } = await render({ mes: '2026-08', busca: 'laser' }, [], new Error('database down'))
    const erro = findAll(tree, EmptyState)[0]

    expect(erro?.props.variant).toBe('erro')
    expect(String(erro?.props.titulo)).toContain('agenda')
    const retry = String((erro?.props.acao as { href?: string })?.href)
    expect(retry).toContain('mes=2026-08')
    expect(retry).toContain('busca=laser')
  })
})

describe('§9 — identity (FR-027)', () => {
  it.each(['page.tsx', 'periodo.ts', 'estilo.ts'])(
    '%s introduces no hexadecimal colour literal',
    (arquivo) => {
      const fonte = readFileSync(join(ROUTE_DIR, arquivo), 'utf8')

      // The colour fence covers `packages/ui/src` and the stylesheets; this route is neither,
      // so its own assertion is what keeps the page on tokens — and it names all three files,
      // because `estilo.ts` is exactly where a hex would hide once the styles moved out of the
      // page the assertion used to read.
      expect(fonte).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    },
  )

  it('titles the tab with the page it is', async () => {
    expect((pageModule as { metadata?: { title?: string } }).metadata?.title).toContain('CALENDÁRIO')
  })
})
