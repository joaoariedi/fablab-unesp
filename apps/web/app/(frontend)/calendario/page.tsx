import type { ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import {
  CalendarDayPanel,
  EmptyState,
  formatHandle,
  LikeButton,
  Pagination,
  SearchInput,
} from '@fablab/ui'

import { PAGE_SIZE } from '../../../lib/public/listing'
import { LISTING_PARAM_KEYS, type RawListingParams } from '../../../lib/public/params'
import { TenantUnresolvedError } from '../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and the other four listings do it, and for the same
// reason: the anonymous read path is not re-exported from `lib/tenancy`'s index, because it
// runs with `overrideAccess: true` and that unexported-ness is one of the two locks it keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'

import { CALENDARIO_CSS, CLASSE, ESTILO } from './estilo'
// The period arithmetic and the URL contract, one module over — see its header for why the
// file was split rather than trimmed.
import {
  cabecalhoDia,
  CALENDARIO_PARAM_KEYS,
  CALENDARIO_PATH,
  calendarioHref,
  celulasDoMes,
  chaveMes,
  diaDeHoje,
  DIAS_ABREV,
  dataPorExtenso,
  deslocarMes,
  diaDoEvento,
  filtroHref,
  horaDoEvento,
  MESES,
  mesAtual,
  parseEstado,
  TIPOS,
  VISOES,
  whereDoMes,
  type Estado,
} from './periodo'

/**
 * T023 / FR-008, FR-010, FR-021, FR-024, FR-027, US5 — the Calendário.
 *
 * `spec.md` FR-008: *"Calendário: month grid and list view, period navigation, type and machine
 * filters, day panel"*. `calendario.md` fixes the bands: the **teal hero**, the **control bar**
 * (`AGENDA DO LAB`, the `MÊS`/`LISTA` switch, `‹ AGOSTO 2026 ›` with `HOJE`, the coloured type
 * chips, the machine select and `Buscar atividades...`), the **month grid** (*"até 3 pílulas de
 * evento … e `+ N mais` quando exceder — abre o painel lateral do dia"*) and the **list view**
 * (*"Eventos agrupados por dia, em ordem cronológica ascendente"*).
 *
 * ── The four things this page does that no other listing does ───────────────────────────────
 *
 * 1. **It reads by period, not by page.** `listPublic` sorts `-inicioEm` and takes twelve rows
 *    (CLR-003, CLR-007); a month grid needs *the month*, ascending, whatever its size, and the
 *    reader deliberately accepts no date range — plan § Sketch 1 lists what a caller may not
 *    say, and a `where` is not on it. So this page issues its own range read through the same
 *    anonymous choke point, which is what `biblioteca-3d/page.tsx` already does for its
 *    sidebar vocabulary. `plan.md` § Risks decides the pagination question the same way:
 *    *"The month grid navigates by period; the numbered control applies to its list view
 *    only"*.
 * 2. **`evento`'s status set is not the three-state queue.** `Evento.ts`: *"`status` is
 *    `rascunho · publicado · cancelado · concluido`, not the three-state review queue"*, and
 *    `spec.md` § Notes for planning: *"A cancelled event that was public must keep showing as
 *    cancelled rather than vanishing"*. So this page adds **no status clause of its own** — the
 *    choke point owns that predicate, and a second opinion here is exactly how an event
 *    disappears from the agenda on the day the two disagree. What the renderer does with
 *    `status` is *label* it: `CANCELADO` is the one label that comes from the field, and
 *    `INSCRIÇÕES ABERTAS` / `ENCERRADO` are derived from the dates, as the page spec requires.
 * 3. **Default view depends on the breakpoint** (CLR-008: *"month on desktop, list on the
 *    compact breakpoints"*). With no client boundary the only instrument for that is CSS, so
 *    with no explicit `?visao=` both views are rendered and {@link CALENDARIO_CSS} shows one.
 *    An explicit choice pins it at every width, which is what makes the switch a link.
 * 4. **It has one island.** The switch, the arrows, the chips and the pagination are anchors;
 *    the day drawer opens and closes in place and cannot be (FR-024, plan § Sketch 6).
 */

export const metadata = { title: 'CALENDÁRIO — Fab Lab CITe Bauru' }
/** `calendario.md` § Visão MÊS: *"até 3 pílulas de evento … e `+ N mais` quando exceder"*. */
export const PILULAS_POR_DIA = 3

/**
 * The cap on one month's read.
 *
 * A month is the unit here, not a page, so there is no `limit` the design implies — but an
 * unbounded read on a public page is a denial of service waiting for the organization that
 * imports a year of recurring slots. Six full events a day is far past anything this lab
 * schedules and still one query.
 */
const EVENTOS_POR_MES = 200

/** Every machine in the lab, for the select. `maquina`'s `publicList` reason says so in as many
 *  words; the cap is a lab's inventory, not a page of results. */
const MAQUINAS_LIMITE = 60
type MidiaDoc = { readonly url?: string | null }
type NomeDoc = { readonly nome?: string }
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/**
 * One event as the scoped client returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it. A page that imported a generated type would compile locally and fail
 * the pipeline.
 */
type EventoDoc = {
  readonly id?: number | string
  readonly titulo?: string
  readonly slug?: string
  readonly tipo?: string
  readonly descricaoCurta?: string
  readonly inicioEm?: string
  readonly fimEm?: string
  readonly diaInteiro?: boolean
  readonly local?: NomeDoc | number | null
  readonly maquinas?: readonly (NomeDoc | number)[] | null
  readonly responsavel?: PerfilDoc | number | null
  readonly vagasTotal?: number | null
  readonly prazoInscricao?: string | null
  readonly capa?: MidiaDoc | number | null
  readonly status?: string
  readonly curtidas?: number
}

type MaquinaDoc = { readonly id?: number | string; readonly nome?: string }

/** A populated relationship, or `null` when it arrived as a bare id. */
const asDoc = <T,>(value: T | number | string | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/** The anonymous client, or the site-wide 404 an unresolved host earns.
 *
 *  `TenantUnresolvedError` is the one failure that must not be contained: serving one
 *  organization's agenda on another's hostname is worse than an error, because nobody would
 *  notice. The layout gives the same answer for the same reason. */
async function clientePublico(): Promise<{
  find: <T>(args: Record<string, unknown>) => Promise<{ docs: T[]; totalDocs: number }>
}> {
  try {
    return (await getPublicScopedPayloadForRSC()) as never
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    throw erro
  }
}

/** Run a public read, containing any failure that is not the host's (FR-018). */
async function lerOuFalhar<T>(ler: () => Promise<T>, aoFalhar: T): Promise<T> {
  try {
    return await ler()
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split `currentOrganization()` makes.
    console.warn('[calendario] a public read failed; rendering the error state.', erro)
    return aoFalhar
  }
}

/** The label that is **derived**, and the one that is not.
 *
 *  `calendario.md` § Modelo de conteúdo: *"Os rótulos `INSCRIÇÕES ABERTAS` · `LOTADO` ·
 *  `ENCERRADO` são derivados de `prazo_inscricao`, `vagas_total` e `fim_em`; só `CANCELADO` vem
 *  deste campo"*. `LOTADO` needs a count of enrolments, and `inscricao` is not in v1 — so it is
 *  absent rather than guessed from `vagasTotal` alone, which would label every event full. */
function rotuloDe(evento: EventoDoc, agora: number): string {
  if (evento.status === 'cancelado') return 'CANCELADO'
  if (evento.fimEm !== undefined && Date.parse(evento.fimEm) < agora) return 'ENCERRADO'
  const prazo = evento.prazoInscricao ?? null
  if (prazo !== null && Date.parse(prazo) < agora) return 'ENCERRADO'
  return 'INSCRIÇÕES ABERTAS'
}

const tipoDe = (evento: EventoDoc): (typeof TIPOS)[number] | undefined =>
  TIPOS.find((tipo) => tipo.value === evento.tipo)

/** `3 h` — the duration the card shows, from the two instants the collection requires. */
function duracaoDe(evento: EventoDoc): string {
  if (evento.inicioEm === undefined || evento.fimEm === undefined) return ''
  const horas = (Date.parse(evento.fimEm) - Date.parse(evento.inicioEm)) / (60 * 60 * 1000)
  return horas > 0 ? `${String(Math.round(horas * 10) / 10)} h` : ''
}

/** The metadata row of `calendario.md` § Visão LISTA, as strings — one per item, because a
 *  screen reader reading "20" and "vagas" as separate items is not a number of places. */
function metadadosDe(evento: EventoDoc): string[] {
  const local = asDoc<NomeDoc>(evento.local)
  const maquinas = (evento.maquinas ?? [])
    .map((maquina) => asDoc<NomeDoc>(maquina)?.nome)
    .filter((nome): nome is string => Boolean(nome))
  const responsavel = asDoc<PerfilDoc>(evento.responsavel)
  const itens: string[] = []
  if (local?.nome !== undefined) itens.push(`📍 ${local.nome}`)
  if (maquinas.length > 0) itens.push(`🖨 ${maquinas.join(', ')}`)
  if (responsavel !== null) {
    itens.push(`👤 ${responsavel.nome ?? ''} ${formatHandle(responsavel.handle ?? '')}`.trim())
  }
  if (typeof evento.vagasTotal === 'number') itens.push(`👥 ${String(evento.vagasTotal)} vagas`)
  const duracao = duracaoDe(evento)
  if (duracao !== '') itens.push(`⏱ ${duracao}`)
  return itens
}

/** One horizontal `CardEvento`. Used by the list view and by the day panel — the same card in
 *  both places, so the drawer cannot drift from the list it came from. */
function cardEvento(evento: EventoDoc, agora: number): ReactElement {
  const tipo = tipoDe(evento)
  const rotulo = rotuloDe(evento, agora)
  const cancelado = rotulo === 'CANCELADO'
  const dia = diaDoEvento(evento.inicioEm)
  return (
    <li key={evento.slug ?? String(evento.id ?? '')} className={CLASSE.card}>
      <span style={ESTILO.blocoData}>
        <span style={ESTILO.diaGrande}>{dia === '' ? '' : String(Number(dia.slice(8)))}</span>
        <span>{dia === '' ? '' : MESES[Number(dia.slice(5, 7)) - 1]}</span>
        <span>{`${horaDoEvento(evento.inicioEm)}–${horaDoEvento(evento.fimEm)}`}</span>
      </span>
      <span style={ESTILO.corpo}>
        <span style={ESTILO.chips}>
          {tipo === undefined ? null : (
            <span style={{ ...ESTILO.chipTipo, borderColor: tipo.cor, color: tipo.cor }}>
              {tipo.label}
            </span>
          )}
          <span style={ESTILO.rotulo}>{rotulo}</span>
        </span>
        {/* Struck through rather than removed: a cancelled event that was public keeps its place
            on the agenda, because a visitor who planned around it needs to be told, and an entry
            that simply vanished tells them nothing (spec § Notes for planning). */}
        <span style={cancelado ? ESTILO.tituloCancelado : ESTILO.titulo}>{evento.titulo ?? ''}</span>
        <span style={ESTILO.descricao}>{evento.descricaoCurta ?? ''}</span>
        <span style={ESTILO.meta}>
          {metadadosDe(evento).map((item) => (
            <span key={item}>{item}</span>
          ))}
          {/* The count, and now the press that answers it (T003, FR-025, US7) — US7 says *"on
              any card that shows a heart"*, and this card shows one.

              `cardEvento` is rendered in two places: the list view, which is server markup, and
              inside `CalendarDayPanel`, which is already an island. Passing a client element as
              a server-built child of a client component is the supported shape — the panel
              receives it in its serialised children and never imports it — so the drawer and
              the list keep showing the same card, which is the whole reason this function is
              shared. */}
          <LikeButton curtidas={evento.curtidas ?? 0} />
        </span>
      </span>
    </li>
  )
}

/** The events of one day, in the order the month read returned them. */
const eventosDoDia = (eventos: readonly EventoDoc[], dia: string): EventoDoc[] =>
  eventos.filter((evento) => diaDoEvento(evento.inicioEm) === dia)


/** One day cell: the number, up to three pills, and the counter that opens the panel. */
function celulaDoDia(
  dia: string,
  estado: Estado,
  eventos: readonly EventoDoc[],
  hoje: string,
): ReactElement {
  const doDia = eventosDoDia(eventos, dia)
  const excedente = doDia.length - PILULAS_POR_DIA
  const foraDoMes = dia.slice(0, 7) !== chaveMes(estado.periodo)
  return (
    <div
      key={dia}
      // The day is on the element, not only in its text: it is what the panel link carries, and
      // what a test — or a script reading the page — addresses a cell by.
      data-dia={dia}
      className={CLASSE.dia}
      style={{
        ...(foraDoMes ? ESTILO.diaFora : ESTILO.dia),
        ...(dia === hoje ? ESTILO.diaHoje : {}),
        ...(dia === estado.dia ? ESTILO.diaSelecionado : {}),
      }}
    >
      <span style={ESTILO.numeroDia}>{String(Number(dia.slice(8)))}</span>
      {doDia.slice(0, PILULAS_POR_DIA).map((evento) => {
        const tipo = tipoDe(evento)
        return (
          <a
            key={evento.slug ?? String(evento.id ?? '')}
            href={calendarioHref(estado, { dia })}
            style={{ ...ESTILO.pilula, borderColor: tipo?.cor ?? 'var(--color-claro)' }}
          >
            {`${horaDoEvento(evento.inicioEm)} ${evento.titulo ?? ''}`}
          </a>
        )
      })}
      {excedente > 0 ? (
        <a href={calendarioHref(estado, { dia })} style={ESTILO.mais}>
          {`+ ${String(excedente)} mais`}
        </a>
      ) : null}
    </div>
  )
}

/** The month grid (`calendario.md` § Visão MÊS). */
function gradeMes(estado: Estado, eventos: readonly EventoDoc[]): ReactElement {
  const hoje = diaDeHoje()
  return (
    <section aria-label="Calendário mensal" className={CLASSE.mes}>
      <div className={CLASSE.grade}>
        {DIAS_ABREV.map((dia) => (
          <span key={dia} style={ESTILO.cabecalhoColuna}>
            {dia}
          </span>
        ))}
        {celulasDoMes(estado.periodo).map((dia) => celulaDoDia(dia, estado, eventos, hoje))}
      </div>
    </section>
  )
}

/**
 * The list view: the month grouped by day, ascending, and the numbered control.
 *
 * The pagination is CLR-003's, on the one view it can mean anything (plan § Risks): a month
 * grid is a period and pages nothing, while a list of forty activities is a listing like the
 * other four. The page slice happens *before* grouping, so a day is never split across two
 * pages in a way that repeats its header.
 */
function visaoLista(estado: Estado, eventos: readonly EventoDoc[], agora: number): ReactElement {
  const totalPages = Math.max(1, Math.ceil(eventos.length / PAGE_SIZE))
  const pagina = Math.min(estado.page, totalPages)
  const daPagina = eventos.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)
  const dias = [...new Set(daPagina.map((evento) => diaDoEvento(evento.inicioEm)))].sort()
  return (
    <section aria-label="Agenda em lista" className={CLASSE.lista}>
      {dias.map((dia) => (
        <div key={dia} style={ESTILO.grupo}>
          <h3 style={ESTILO.grupoTitulo}>{cabecalhoDia(dia)}</h3>
          <ol style={ESTILO.cards}>
            {eventosDoDia(daPagina, dia).map((evento) => cardEvento(evento, agora))}
          </ol>
        </div>
      ))}
      <Pagination
        page={pagina}
        totalPages={totalPages}
        hrefFor={(n) => calendarioHref(estado, { page: n })}
      />
    </section>
  )
}

/** The hero band (`calendario.md` § Hero). The page stays navy (round 2, 2026-08-23); the band
 *  is teal, with navy ink, which is the documented pair. */
function hero(): ReactElement {
  return (
    <section style={ESTILO.hero}>
      <h1 style={ESTILO.heroTitulo}>CALENDÁRIO</h1>
      <p style={ESTILO.heroTexto}>
        Veja o que vai rolar no lab e garanta seu lugar nas próximas atividades.
      </p>
    </section>
  )
}

/** The view switch and the period navigation — anchors, both, so neither view needs a bundle. */
function barraControle(estado: Estado): ReactElement {
  const anterior = deslocarMes(estado.periodo, -1)
  const proximo = deslocarMes(estado.periodo, 1)
  return (
    <section style={ESTILO.barra}>
      <h2 style={ESTILO.barraTitulo}>AGENDA DO LAB</h2>
      <nav aria-label="Visualização" style={ESTILO.grupoLinks}>
        {VISOES.map((visao) => (
          <a
            key={visao}
            href={calendarioHref(estado, { visao })}
            aria-current={estado.visao === visao ? 'page' : undefined}
            style={estado.visao === visao ? ESTILO.chipAtivo : ESTILO.chip}
          >
            {visao === 'mes' ? 'MÊS' : 'LISTA'}
          </a>
        ))}
      </nav>
      <nav aria-label="Navegação de período" style={ESTILO.grupoLinks}>
        <a
          href={calendarioHref(estado, { periodo: anterior, page: 1, dia: '' })}
          aria-label={`Mês anterior: ${MESES[anterior.mes - 1]} ${String(anterior.ano)}`}
          style={ESTILO.seta}
        >
          ‹
        </a>
        <span style={ESTILO.periodo}>{`${MESES[estado.periodo.mes - 1]} ${String(estado.periodo.ano)}`}</span>
        <a
          href={calendarioHref(estado, { periodo: proximo, page: 1, dia: '' })}
          aria-label={`Próximo mês: ${MESES[proximo.mes - 1]} ${String(proximo.ano)}`}
          style={ESTILO.seta}
        >
          ›
        </a>
        <a href={calendarioHref(estado, { periodo: mesAtual(), page: 1, dia: '' })} style={ESTILO.hoje}>
          HOJE
        </a>
      </nav>
    </section>
  )
}

/** The type chips: multi-select by link, because a chip that toggles is a URL and not state. */
function chipsDeTipo(estado: Estado): ReactElement {
  return (
    <nav aria-label="Filtros de tipo" className={CLASSE.chips}>
      <a
        href={filtroHref(estado, { tipos: [] })}
        aria-current={estado.tipos.length === 0 ? 'page' : undefined}
        style={estado.tipos.length === 0 ? ESTILO.chipAtivo : ESTILO.chip}
      >
        TODOS
      </a>
      {TIPOS.map((tipo) => {
        const ativo = estado.tipos.includes(tipo.value)
        // Selected chips subtract, unselected ones add: with no client boundary, the link IS
        // the toggle, and a chip that could only ever add would be a filter with no way off.
        const tipos = ativo
          ? estado.tipos.filter((valor) => valor !== tipo.value)
          : [...estado.tipos, tipo.value]
        return (
          <a
            key={tipo.value}
            href={filtroHref(estado, { tipos })}
            aria-current={ativo ? 'page' : undefined}
            style={ativo ? { ...ESTILO.chipAtivo, borderColor: tipo.cor } : { ...ESTILO.chip, borderColor: tipo.cor }}
          >
            {tipo.label}
          </a>
        )
      })}
    </nav>
  )
}

/**
 * The machine select and the search field, as one GET form.
 *
 * The hidden inputs are load-bearing: a GET form submits only its own fields, so without them a
 * search silently resets the month and the type chips the visitor can still see highlighted.
 * The submit button is too — a `<select>` fires no navigation on its own, and this page has no
 * client boundary to give it one.
 */
function barraFiltros(estado: Estado, maquinas: readonly MaquinaDoc[]): ReactElement {
  return (
    <form method="get" action={CALENDARIO_PATH} className={CLASSE.filtros}>
      {chaveMes(estado.periodo) === chaveMes(mesAtual()) ? null : (
        <input
          type="hidden"
          name={CALENDARIO_PARAM_KEYS.mes}
          value={chaveMes(estado.periodo)}
          readOnly={true}
        />
      )}
      {estado.visao === 'auto' ? null : (
        <input type="hidden" name={CALENDARIO_PARAM_KEYS.visao} value={estado.visao} readOnly={true} />
      )}
      {estado.tipos.map((tipo) => (
        <input
          key={tipo}
          type="hidden"
          name={CALENDARIO_PARAM_KEYS.tipo}
          value={tipo}
          readOnly={true}
        />
      ))}
      <SearchInput
        label="Buscar atividades"
        placeholder="Buscar atividades..."
        name={LISTING_PARAM_KEYS.busca}
      />
      <select
        name={CALENDARIO_PARAM_KEYS.maquina}
        aria-label="Filtrar por máquina"
        defaultValue={estado.maquina}
        style={ESTILO.seletor}
      >
        <option value="">Todas as máquinas</option>
        {maquinas.map((maquina) => (
          <option key={String(maquina.id)} value={String(maquina.id)}>
            {maquina.nome ?? ''}
          </option>
        ))}
      </select>
      <button type="submit" style={ESTILO.aplicar}>
        APLICAR
      </button>
    </form>
  )
}

/** The empty and error bodies (FR-017, FR-018, US5). */
function semAgenda(estado: Estado, falhou: boolean): ReactElement {
  if (falhou) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar a agenda."
        // The URL that just failed, period and filters included: a retry that quietly drops
        // them reports success for a different page than the one that broke.
        acao={{ label: 'Tentar novamente', href: calendarioHref(estado, { page: 1 }) }}
      />
    )
  }

  const filtrado = estado.tipos.length > 0 || estado.maquina !== '' || estado.busca !== ''
  if (filtrado) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhuma atividade com esses filtros."
        descricao="Tente outro tipo, outra máquina ou limpe a busca."
        acao={{
          label: 'Limpar filtros',
          // The month survives the clearing: the visitor asked to see August, not to start over.
          href: calendarioHref(estado, { tipos: [], maquina: '', busca: '', page: 1, dia: '' }),
        }}
      />
    )
  }

  return (
    <EmptyState
      variant="vazio"
      titulo={`Nenhuma atividade programada para ${MESES[estado.periodo.mes - 1]} ${String(estado.periodo.ano)}.`}
      // US5's error case: the way out of an empty month is the next one, and the navigation
      // above stays on screen either way.
      acao={{
        label: 'Ver próximo mês',
        href: calendarioHref(estado, { periodo: deslocarMes(estado.periodo, 1), page: 1, dia: '' }),
      }}
    />
  )
}

/** The day drawer, when the URL asks for a day that has something on it. */
function painelDoDia(
  estado: Estado,
  eventos: readonly EventoDoc[],
  agora: number,
): ReactNode {
  if (estado.dia === '') return null
  const doDia = eventosDoDia(eventos, estado.dia)
  if (doDia.length === 0) return null
  return (
    <CalendarDayPanel
      titulo={dataPorExtenso(estado.dia)}
      fecharHref={calendarioHref(estado, { dia: '' })}
    >
      <ol style={ESTILO.cards}>{doDia.map((evento) => cardEvento(evento, agora))}</ol>
    </CalendarDayPanel>
  )
}

/** Next hands a page its query string as a promise. */
type CalendarioPageProps = { readonly searchParams: Promise<RawListingParams> }

/**
 * `/calendario` — the lab's agenda, in two views.
 *
 * @example /calendario?mes=2026-08&tipo=oficina&visao=lista
 */
export default async function Page({ searchParams }: CalendarioPageProps): Promise<ReactElement> {
  const estado = parseEstado(await searchParams)
  const db = await clientePublico()

  // `null` is "this read failed", which is a different page from "this month has nothing on it".
  const eventos = await lerOuFalhar<EventoDoc[] | null>(async () => {
    const { docs } = await db.find<EventoDoc>({
      collection: 'evento',
      where: whereDoMes(estado),
      depth: 1,
      limit: EVENTOS_POR_MES,
      // Ascending: a calendar reads forwards through its month, where every other listing is
      // most-recent-first (CLR-007).
      sort: 'inicioEm',
    })
    return docs
  }, null)

  // A machine list that failed is a select with one option, never a page that will not render:
  // the agenda is the content, and its filter is not worth taking it down for.
  const maquinas = await lerOuFalhar<MaquinaDoc[]>(async () => {
    const { docs } = await db.find<MaquinaDoc>({
      collection: 'maquina',
      depth: 0,
      limit: MAQUINAS_LIMITE,
      sort: 'nome',
    })
    return docs
  }, [])

  const agora = Date.now()
  const vazio = eventos === null || eventos.length === 0

  return (
    <main style={ESTILO.pagina}>
      {hero()}
      {barraControle(estado)}
      {chipsDeTipo(estado)}
      {barraFiltros(estado, maquinas)}
      <section
        className={CLASSE.conteudo}
        // The breakpoint default of CLR-008, expressed where a server component can express it:
        // with no explicit choice both views are in the markup and the stylesheet shows one.
        data-visao={estado.visao}
      >
        {vazio ? (
          semAgenda(estado, eventos === null)
        ) : (
          <>
            {estado.visao === 'lista' ? null : gradeMes(estado, eventos)}
            {estado.visao === 'mes' ? null : visaoLista(estado, eventos, agora)}
            {painelDoDia(estado, eventos, agora)}
          </>
        )}
      </section>
      {/* React 19 hoists a precedence-carrying <style> into <head> from wherever it sits. */}
      <style href="fablab-calendario" precedence="default">
        {CALENDARIO_CSS}
      </style>
    </main>
  )
}

