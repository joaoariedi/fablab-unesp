/**
 * T023 / FR-008, FR-010, US5 — the calendar's period arithmetic and its URL contract.
 *
 * Split out of `page.tsx` because that file passed the 500-line limit
 * (`.claude/rules/code-quality.md`), and this is where the seam falls naturally: everything
 * here is a pure function of a query string and a date, and none of it renders anything. The
 * page is left with the reads and the markup.
 *
 * It is the calendar's half of the URL-state contract `lib/public/params.ts` owns for the four
 * item listings. The two halves meet rather than compete: `busca` and `pagina` are parsed by
 * `parseListingParams` and spelled with `LISTING_PARAM_KEYS`, because the search island's
 * `name` and the pagination's hrefs have to agree with that parser. What is added here is what
 * an agenda has and a listing does not — a period, two views, a multi-select type filter, a
 * machine and an open day.
 *
 * Nothing here throws, for the reason `params.ts` gives at length: every input is a query
 * string a stranger controls, and a stale bookmark has a correct rendering — this month, the
 * unfiltered agenda — where a 500 on a public page has none.
 */

import {
  LISTING_PARAM_KEYS,
  parseListingParams,
  type RawListingParams,
} from '../../../lib/public/params'

/** This page's own path. Every link is built from it, so the route moves in one edit. */
export const CALENDARIO_PATH = '/calendario'

/**
 * The query-string keys this page adds to the shared listing contract.
 *
 * `busca` and `pagina` are `LISTING_PARAM_KEYS`' — spelled once, in `params.ts`, because the
 * search island's `name` and the pagination's hrefs have to agree with the parser. The four
 * here are the calendar's own, in Portuguese like the rest of the visitor-facing surface.
 */
export const CALENDARIO_PARAM_KEYS = {
  /** `YYYY-MM`, the period on screen. Absent means the current month. */
  mes: 'mes',
  /** `mes` | `lista`. Absent means "let the breakpoint decide" (CLR-008). */
  visao: 'visao',
  /** Repeatable: the type filter is multi-select (`calendario.md` § Barra de controle). */
  tipo: 'tipo',
  maquina: 'maquina',
  /** `YYYY-MM-DD`, the day whose panel is open. */
  dia: 'dia',
} as const
/**
 * São Paulo, as a fixed offset.
 *
 * Brazil abolished DST in 2019, so `America/Sao_Paulo` has been a constant −03:00 since — which
 * is what lets the month boundaries be built as literal strings and an event's day be derived
 * by arithmetic. The alternative, `Intl` with a time zone, needs full ICU data in every runtime
 * that renders this page, and gets the *same* answer for every date this agenda can hold.
 *
 * It matters because the events are stored as instants: 23:30 on a Saturday in São Paulo is
 * 02:30 **Sunday** in UTC, so a page that grouped by the UTC date would draw half the evening
 * activities on the following day.
 */
const FUSO_OFFSET = '-03:00'
const FUSO_MS = 3 * 60 * 60 * 1000

/** `Evento.tipo`'s six options (`Evento.ts`), with the label and the chip colour the page spec
 *  draws. A seventh type is a row here and in the collection — the two are checked against each
 *  other by nothing, which is why the vocabulary is named in one place on each side. */
export const TIPOS = [
  { value: 'oficina', label: 'OFICINA', cor: 'var(--color-teal)' },
  { value: 'aula_presencial', label: 'AULA PRESENCIAL', cor: 'var(--color-azul)' },
  { value: 'mutirao', label: 'MUTIRÃO', cor: 'var(--color-laranja)' },
  { value: 'manutencao', label: 'MANUTENÇÃO', cor: 'var(--color-amarelo)' },
  { value: 'evento_aberto', label: 'EVENTO ABERTO', cor: 'var(--color-primary)' },
  { value: 'prazo_missao', label: 'PRAZO DE MISSÃO', cor: 'var(--color-claro)' },
] as const

export const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
] as const

/** Monday first, as the grid is drawn: `SEG TER QUA QUI SEX SÁB DOM`. */
export const DIAS_ABREV = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const
export const DIAS_EXTENSO = [
  'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA',
  'SEXTA-FEIRA', 'SÁBADO', 'DOMINGO',
] as const

const pad2 = (valor: number): string => String(valor).padStart(2, '0')

/** `2026-08-22` for a UTC instant — the shared spelling of a day on this page. */
export const diaISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/**
 * The day an event belongs to **in the lab's timezone**, which is the only one the agenda has.
 *
 * A date the runtime cannot parse yields `''` rather than throwing: this is a public page
 * rendering rows an editor typed, and one malformed instant must not be a 500 for the whole
 * month. Such an event lands on no cell and in no day group, which is the quietest failure
 * available — it is already invisible in every calendar client for the same reason.
 */
export function diaDoEvento(iso: string | undefined): string {
  if (iso === undefined) return ''
  const instante = Date.parse(iso)
  return Number.isNaN(instante) ? '' : diaISO(instante - FUSO_MS)
}

/** `14:00` in the lab's timezone. */
export function horaDoEvento(iso: string | undefined): string {
  if (iso === undefined) return ''
  const instante = Date.parse(iso)
  if (Number.isNaN(instante)) return ''
  const local = new Date(instante - FUSO_MS)
  return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`
}

/** The weekday index of a `YYYY-MM-DD`, Monday-first, to index {@link DIAS_ABREV}. */
export const diaDaSemana = (dia: string): number => (new Date(`${dia}T00:00:00.000Z`).getUTCDay() + 6) % 7

/** Today, in the lab's timezone — the cell the grid outlines in the accent. The offset lives
 *  in this module, so the page never does timezone arithmetic of its own. */
export const diaDeHoje = (): string => diaISO(Date.now() - FUSO_MS)

export type Periodo = { readonly ano: number; readonly mes: number }

/** The month it is *now*, in the lab's timezone — what `HOJE` returns to and what an absent or
 *  malformed `?mes=` falls back to. */
export const mesAtual = (): Periodo => {
  const hoje = new Date(Date.now() - FUSO_MS)
  return { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 }
}

export const chaveMes = ({ ano, mes }: Periodo): string => `${String(ano)}-${pad2(mes)}`

/** The instant a month starts, in the lab's timezone: the lower bound of the period read. */
export const inicioDoMes = ({ ano, mes }: Periodo): string =>
  `${String(ano)}-${pad2(mes)}-01T00:00:00.000${FUSO_OFFSET}`

/** `n` months away, rolling the year rather than writing a thirteenth month. */
export const deslocarMes = ({ ano, mes }: Periodo, passos: number): Periodo => {
  const total = ano * 12 + (mes - 1) + passos
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 }
}

/**
 * `?mes=2026-08`, or the month it is now.
 *
 * Nothing throws, for the reason `params.ts` gives at length: every input here is a query string
 * a stranger controls, and a bookmark from a renamed link has a correct rendering — this month —
 * where a 500 on a public page has none.
 */
export function parseMes(valor: string): Periodo {
  const match = /^(\d{4})-(\d{2})$/.exec(valor)
  if (match === null) return mesAtual()
  const ano = Number(match[1])
  const mes = Number(match[2])
  return mes >= 1 && mes <= 12 ? { ano, mes } : mesAtual()
}

export type Visao = 'auto' | 'mes' | 'lista'

/** The whole of this page's URL state, parsed once. */
export type Estado = {
  readonly periodo: Periodo
  readonly visao: Visao
  readonly tipos: readonly string[]
  readonly maquina: string
  readonly busca: string
  readonly dia: string
  readonly page: number
}

/** The first value for a key; a repeated key is first-wins, as `params.ts` decides for all. */
const primeiro = (raw: RawListingParams, chave: string): string => {
  const valor = raw instanceof URLSearchParams ? raw.get(chave) : raw[chave]
  if (Array.isArray(valor)) return valor[0] ?? ''
  return valor ?? ''
}

/** Every value for a repeatable key — the type filter is the only one (multi-select). */
function todos(raw: RawListingParams, chave: string): string[] {
  if (raw instanceof URLSearchParams) return raw.getAll(chave)
  const valor = raw[chave]
  if (Array.isArray(valor)) return valor
  return valor === undefined ? [] : [valor]
}

export const VISOES: readonly Visao[] = ['mes', 'lista']

/**
 * The query string as state nothing downstream re-checks.
 *
 * `parseListingParams` is reused for `busca` and `pagina` rather than reimplemented: it is the
 * module that decides what `?pagina=0` and `?pagina=999999999999999999999` mean, and a second
 * opinion here is a second bug. `knownCategories` is empty because `evento` declares no
 * category — its vocabulary is `tipo`, which is a fixed enum rather than tenant data.
 */
export function parseEstado(raw: RawListingParams): Estado {
  const listagem = parseListingParams(raw, { knownCategories: [] })
  const visao = primeiro(raw, CALENDARIO_PARAM_KEYS.visao) as Visao
  const dia = primeiro(raw, CALENDARIO_PARAM_KEYS.dia)
  return {
    periodo: parseMes(primeiro(raw, CALENDARIO_PARAM_KEYS.mes)),
    visao: VISOES.includes(visao) ? visao : 'auto',
    // An unknown type narrows away rather than reaching the query: the six are a fixed
    // vocabulary, so `?tipo=churrasco` is a stale link, not a filter anyone can act on.
    tipos: todos(raw, CALENDARIO_PARAM_KEYS.tipo).filter((valor) =>
      TIPOS.some((tipo) => tipo.value === valor),
    ),
    maquina: primeiro(raw, CALENDARIO_PARAM_KEYS.maquina),
    busca: listagem.busca,
    dia: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : '',
    page: listagem.page,
  }
}

/**
 * The URL that renders a state (FR-010, SC-005) — the inverse of {@link parseEstado}.
 *
 * Defaults are omitted so the current month is a clean `/calendario` rather than one listing
 * with several URLs for crawlers to duplicate. That omission is also what makes `HOJE` work: it
 * is the link to a state whose period is the default one.
 */
export function calendarioHref(estado: Estado, mudanca: Partial<Estado> = {}): string {
  const alvo = { ...estado, ...mudanca }
  const query = new URLSearchParams()
  if (chaveMes(alvo.periodo) !== chaveMes(mesAtual())) {
    query.set(CALENDARIO_PARAM_KEYS.mes, chaveMes(alvo.periodo))
  }
  if (alvo.visao !== 'auto') query.set(CALENDARIO_PARAM_KEYS.visao, alvo.visao)
  for (const tipo of alvo.tipos) query.append(CALENDARIO_PARAM_KEYS.tipo, tipo)
  if (alvo.maquina !== '') query.set(CALENDARIO_PARAM_KEYS.maquina, alvo.maquina)
  if (alvo.busca !== '') query.set(LISTING_PARAM_KEYS.busca, alvo.busca)
  if (alvo.dia !== '') query.set(CALENDARIO_PARAM_KEYS.dia, alvo.dia)
  if (alvo.page > 1) query.set(LISTING_PARAM_KEYS.page, String(alvo.page))
  const texto = query.toString()
  return texto === '' ? CALENDARIO_PATH : `${CALENDARIO_PATH}?${texto}`
}

/** A filter change starts a fresh reading of the month: page 1, no panel open. */
export const filtroHref = (estado: Estado, mudanca: Partial<Estado>): string =>
  calendarioHref(estado, { ...mudanca, page: 1, dia: '' })

/**
 * The `where` of the period read.
 *
 * **No status clause, deliberately** — see this module's header. The tenant constraint is
 * `buildTenantClient`'s and the published predicate is `getPublicScopedPayload`'s; everything
 * here is the visitor's own filtering, AND-ed so a type filter cannot widen a search.
 */
export function whereDoMes(estado: Estado): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [
    { inicioEm: { greater_than_or_equal: inicioDoMes(estado.periodo) } },
    { inicioEm: { less_than: inicioDoMes(deslocarMes(estado.periodo, 1)) } },
  ]
  if (estado.tipos.length > 0) clauses.push({ tipo: { in: [...estado.tipos] } })
  // `in` rather than `equals`: `maquinas` is `hasMany`, and the filter asks whether the machine
  // is among an event's, not whether it is the only one.
  if (estado.maquina !== '') clauses.push({ maquinas: { in: [estado.maquina] } })
  if (estado.busca !== '') {
    clauses.push({
      or: [{ titulo: { like: estado.busca } }, { descricaoCurta: { like: estado.busca } }],
    })
  }
  return { and: clauses }
}
/** The cells of the month grid: whole weeks, so the last row is never ragged. */
export function celulasDoMes({ ano, mes }: Periodo): string[] {
  const primeiroDia = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const total = Math.ceil((primeiroDia + diasNoMes) / 7) * 7
  return Array.from({ length: total }, (_, i) =>
    diaISO(Date.UTC(ano, mes - 1, 1 - primeiroDia + i)),
  )
}
/** `22 SÁB · AGOSTO` — the sticky day header of the list view. */
export const cabecalhoDia = (dia: string): string =>
  `${String(Number(dia.slice(8)))} ${DIAS_ABREV[diaDaSemana(dia)]} · ${MESES[Number(dia.slice(5, 7)) - 1]}`

/** `SÁBADO, 22 DE AGOSTO` — the panel's title, the date in full. */
export const dataPorExtenso = (dia: string): string =>
  `${DIAS_EXTENSO[diaDaSemana(dia)]}, ${String(Number(dia.slice(8)))} DE ${MESES[Number(dia.slice(5, 7)) - 1]}`
