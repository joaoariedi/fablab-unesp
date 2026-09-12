import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { AUTOR_REMOVIDO, EmptyState, formatHandle, LikeButton, Pagination, SearchInput } from '@fablab/ui'

import { listPublic } from '../../../lib/public/listing'
import {
  ALL_CATEGORIES,
  LISTING_PARAM_KEYS,
  listingHref,
  parseListingParams,
  type ListingParams,
  type RawListingParams,
} from '../../../lib/public/params'
import { TenantUnresolvedError } from '../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and the Projetos listing do it, and for the same
// reason: the anonymous read path is not re-exported from `lib/tenancy`'s index, because it
// runs with `overrideAccess: true` and that unexported-ness is one of the two locks it keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'
import { ALLOWED_EXTENSIONS } from '../../../lib/uploads/limits'

/**
 * T020 / FR-007, FR-010, FR-021, FR-027, FR-028, FR-029, US1, US2, US3 — Biblioteca 3D.
 *
 * `biblioteca-3d.md` fixes the four bands: the **teal sidebar** (*"título display navy em duas
 * linhas `BIBLIOTECA` / `3D`"*, a description, and a `CATEGORIAS` block whose items are *"tags
 * de tema que filtram o conteúdo"*), the **filter bar** (*"placeholder `Buscar modelos 3D...`"*
 * and *"`FILTRAR POR:` seguido de três dropdowns"*), the **numbered card list** (*"numerados
 * `01`–`10` em caixa com contorno"*, two columns, the numbering running down each column) and
 * the **pagination** beneath it.
 *
 * ── One of the two light pages, and what that costs ─────────────────────────────────────────
 *
 * Decided 2026-08-23: *"a Biblioteca 3D (com Aulas) usa fundo branco na área de conteúdo, com
 * texto navy"*, and round 2 adds *"os cards são brancos com contorno azul navy escuro e sombra;
 * as thumbnails mantêm o fundo navy; todo texto sobre branco usa azul navy escuro (nada de rosa
 * em texto pequeno sobre branco)"*. That last clause is FR-028 and it is what resolved this
 * page's WCAG risk — so `--color-primary` appears here on **no** text, only as the heart's
 * accent beside a navy number.
 *
 * ── A server component, and the reason CLR-002 depends on it ────────────────────────────────
 *
 * This is the page that carries the most cards in the product, and CLR-002 moved the 3D viewer
 * off it precisely so it could stay server-rendered: *"preview-per-card means twelve WebGL
 * contexts competing with the 2.5s LCP budget"*. Every control here is therefore a link or a
 * plain GET form — the sidebar tags navigate, the pagination navigates, the empty state's
 * `LIMPAR FILTROS` navigates, and the three selects submit. No `'use client'`, no island.
 *
 * ── Why the two content selects narrow the query through the shared reader ──────────────────
 *
 * `ordem` is CLR-007's fixed most-recent-first, which `listing.ts` already sorts by. `nivel`
 * (CLR-006: the MODEL's difficulty, not the maker's level) and `formato` need a `where` clause,
 * and the first draft of this page shipped without one — the values were parsed, validated
 * against their option lists, written into every link and set as each select's `defaultValue`,
 * and then dropped. A visitor chose "Avançado", pressed APLICAR, and got the identical
 * unfiltered catalogue with the select showing a filter that had never been applied. Two
 * advertised controls that lie, and nothing red anywhere, because there was nothing to be red.
 *
 * The reader now takes a `filtros` map, and it is an **allowlist** rather than a `where`
 * parameter: `LISTING_SHAPES.modelo3d` declares which URL keys narrow which document fields, so
 * a page still cannot name a tenant or a status — the thing Sketch 1 keeps out of that
 * signature — and a key the collection does not declare raises instead of being ignored. That
 * seam is also what Calendário's type and machine filters (T023) need, which is the argument
 * for building it rather than deferring it twice.
 */

export const metadata = { title: 'BIBLIOTECA 3D — Fab Lab CITe Bauru' }

/** This listing's own path. Every link on the page is built from it, so the route moves in one
 *  edit and no href is left pointing at the old one. */
export const BIBLIOTECA_PATH = '/biblioteca-3d'

/** Payload's REST mount (`routes.api` is left at its default), where `Modelo3d.ts`'s own
 *  `downloadEndpoint('modelo3d', 'arquivosModelo')` is served. */
const API = '/api'

/** How many category rows the sidebar may hold — a guard against an unbounded read, not a
 *  paging strategy. A vocabulary that outgrows it is a design problem, not a pagination one. */
const CATEGORIA_LIMIT = 50

/** The columns the card list draws at the tablet target and above (`biblioteca-3d.md` § Lista
 *  de modelos, and CLR-003's *"two columns give six rows"*). */
const COLUNAS = 2

/** The widest row the list draws, so the cards above the fold are fetched eagerly (SC-006). */
const PRIMEIRA_LINHA = COLUNAS

/** The category vocabulary as this page reads it. Structural rather than imported from
 *  `payload-types.ts`, which is **gitignored**: a page importing a generated type compiles
 *  locally and fails the pipeline (tasks.md § "Read before starting", item 6). */
type CategoriaDoc = {
  readonly nome?: string
  readonly slug?: string
  readonly totalModelos?: number
}

/** One media document as `depth: 1` populates it. `sizes.card` is the derivative `midiaImagem`
 *  generates for exactly this list. */
type MidiaDoc = {
  readonly id?: string | number
  readonly url?: string | null
  readonly sizes?: { readonly card?: { readonly url?: string | null } }
}

/** The envelope a **polymorphic** relationship arrives in — `arquivosModelo` spans the 3D and
 *  document media collections, so each entry names which one it came from. */
type ArquivoRef = { readonly relationTo?: string; readonly value?: MidiaDoc | string | number }

/** The author strip's source: this organization's maker profile, populated one level.
 *  `perfilMaker` carries **no level** — XP is feature 005 — so the card prints none. */
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/** One model as the listing reader returns it, populated one level. */
type Modelo3dDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly thumbnail?: MidiaDoc | string | number | null
  readonly autor?: PerfilDoc | string | number | null
  readonly arquivosModelo?: readonly (ArquivoRef | string | number)[] | null
  readonly curtidas?: number
}

type Opcao = { readonly value: string; readonly label: string }

/** The three dropdowns of *"FILTRAR POR:"*, as data — the option lists, their defaults and
 *  their accessible names in one place, because the markup, the URL round-trip and the link
 *  builders all have to agree about them. */
type FiltroDef = {
  readonly chave: 'ordem' | 'nivel' | 'formato'
  /** The accessible name. A `<select>` whose only label is its first option announces as
   *  "Todos os níveis" — the current value, never what the control is for. */
  readonly rotulo: string
  /** The value that means "not filtered", omitted from every URL this page writes. */
  readonly padrao: string
  readonly opcoes: readonly Opcao[]
}

/**
 * The formats the filter offers — **derived from the upload allowlists, never retyped.**
 *
 * `Modelo3d.formatos` builds its options from this same source, so the invariant that matters
 * holds by construction: a value the field can store always has a filter option that names it.
 * A hand-kept list here would go stale in the one direction that hides models — a stored
 * format nothing in the UI can select.
 */
const FORMATO_OPCOES: readonly Opcao[] = [
  ...new Set([...ALLOWED_EXTENSIONS.model3d, ...ALLOWED_EXTENSIONS.document]),
]
  .sort()
  .map((extensao) => ({ value: extensao, label: extensao.replace('.', '').toUpperCase() }))

const FILTROS: readonly FiltroDef[] = [
  {
    chave: 'ordem',
    rotulo: 'Ordenar modelos',
    // CLR-007: *"every listing orders by publication date descending"*, and it is the only
    // ordering whose input exists before feature 005 — "mais curtidos" needs the like counters
    // populated. One option is the honest option set, not a stub for four.
    padrao: 'recentes',
    opcoes: [{ value: 'recentes', label: 'Mais recentes' }],
  },
  {
    chave: 'nivel',
    rotulo: 'Filtrar por nível de dificuldade',
    padrao: '',
    // CLR-006 settles what this filters: the **model's** difficulty, not the maker's level —
    // decided by the shipped data model (`Modelo3d.nivelDificuldade`), whose three values these
    // are.
    opcoes: [
      { value: '', label: 'Todos os níveis' }, { value: 'iniciante', label: 'Iniciante' },
      { value: 'intermediario', label: 'Intermediário' }, { value: 'avancado', label: 'Avançado' },
    ],
  },
  {
    chave: 'formato',
    rotulo: 'Filtrar por formato de arquivo',
    padrao: '',
    opcoes: [{ value: '', label: 'Todos os formatos' }, ...FORMATO_OPCOES],
  },
]

/** The three filter values, already narrowed to options that exist. */
type Filtros = Record<FiltroDef['chave'], string>

/** The first value for a key, because a repeated key is a real request — the same first-wins
 *  rule `params.ts` applies, so both input shapes behave identically. */
function primeiroValor(raw: RawListingParams, chave: string): string {
  const valor = raw instanceof URLSearchParams ? raw.get(chave) : raw[chave]
  if (Array.isArray(valor)) return valor[0] ?? ''
  return valor ?? ''
}

/**
 * The three selects' state, narrowed the way `params.ts` narrows the category: a value the
 * vocabulary does not have falls back to the default rather than erroring or rendering a
 * control whose shown option does not exist (US2's error case).
 */
function parseFiltros(raw: RawListingParams): Filtros {
  const filtros = {} as Record<FiltroDef['chave'], string>
  for (const filtro of FILTROS) {
    const valor = primeiroValor(raw, filtro.chave).trim()
    filtros[filtro.chave] = filtro.opcoes.some((opcao) => opcao.value === valor)
      ? valor
      : filtro.padrao
  }
  return filtros
}

/**
 * The URL for this listing in a given state (FR-010, SC-005).
 *
 * `listingHref` owns the three shared parameters; the selects are appended after it, in the
 * order they are declared, and only when they differ from their default — so an unfiltered
 * first page stays the bare path rather than `?ordem=recentes&nivel=&formato=`.
 */
function bibliotecaHref(params: ListingParams, filtros: Filtros): string {
  const base = listingHref(BIBLIOTECA_PATH, params)
  const extras = FILTROS.filter((filtro) => filtros[filtro.chave] !== filtro.padrao).map(
    (filtro) => `${filtro.chave}=${encodeURIComponent(filtros[filtro.chave])}`,
  )
  if (extras.length === 0) return base
  return `${base}${base.includes('?') ? '&' : '?'}${extras.join('&')}`
}

/**
 * The URL for a category tag, with the search and the selects kept and the page number dropped.
 *
 * Page 3 of `TODOS` is not page 3 of `ANIMAIS`, so carrying the number across a filter change
 * lands the visitor on a page that may not exist. Everything else survives: narrowing by
 * category is not abandoning the other filters.
 */
const filtroHref = (params: ListingParams, filtros: Filtros, categoria: string): string =>
  bibliotecaHref({ ...params, categoria, page: 1 }, filtros)

/**
 * Run a public read, and answer the two failures a visitor can actually meet.
 *
 * An **unresolved host** is 404 for the whole site, the same answer `layout.tsx` gives. Anything
 * else is an outage of this one read, and FR-018 says the page reports it in place with a retry
 * — the sidebar, its tags and the search field stay usable.
 */
async function lerOuFalhar<T>(ler: () => Promise<T>, aoFalhar: T): Promise<T> {
  try {
    return await ler()
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split `currentOrganization()` makes.
    console.warn('[biblioteca-3d] a public read failed; rendering the error state.', erro)
    return aoFalhar
  }
}

/**
 * This organization's model categories, through the anonymous choke point.
 *
 * The one read this page issues directly, and the reason T004 declared `publicList` on
 * `categoriaModelo`: *"Biblioteca 3D draws the teal sidebar CATEGORIAS list … an empty page of
 * results must still render every category so the visitor can leave it"*.
 *
 * `depth: 0`, so the `icone` relationship arrives as an id and the sidebar draws no icons. That
 * is deliberate: an icon per category is one extra request per row on the page whose LCP budget
 * this feature exists to measure (SC-006), for art the label already carries the meaning of.
 * `ordem` is the collection's own sort key — *"posição na barra lateral, de cima para baixo"*.
 */
async function lerCategorias(): Promise<CategoriaDoc[]> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<CategoriaDoc>({
    collection: 'categoriaModelo',
    depth: 0,
    limit: CATEGORIA_LIMIT,
    sort: 'ordem',
  })
  return docs
}

/** The slugs `parseListingParams` will accept. Anything else in the URL narrows to `TODOS`. */
const slugsDe = (categorias: readonly CategoriaDoc[]): string[] =>
  categorias.map((categoria) => categoria.slug).filter((slug): slug is string => Boolean(slug))

const asDoc = <T,>(value: T | string | number | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/** The thumbnail URL: the generated card derivative, or the original when none was made. */
function thumbSrc(thumbnail: Modelo3dDoc['thumbnail']): string {
  const midia = asDoc<MidiaDoc>(thumbnail)
  return midia?.sizes?.card?.url ?? midia?.url ?? ''
}

/** The media documents behind `arquivosModelo`, unwrapped from the polymorphic envelope. */
function arquivosDe(modelo: Modelo3dDoc): MidiaDoc[] {
  return (modelo.arquivosModelo ?? [])
    .map((arquivo) => asDoc<ArquivoRef>(arquivo))
    .map((arquivo) => asDoc<MidiaDoc>(arquivo?.value))
    .filter((midia): midia is MidiaDoc => midia !== null)
}

/** `GET /api/modelo3d/:id/download/:midiaId` — the route `Modelo3d.ts` registers. Both ids come
 *  from the document just read, so a visitor can name neither. */
const downloadHref = (modeloId: Modelo3dDoc['id'], midiaId: MidiaDoc['id']): string =>
  `${API}/modelo3d/${String(modeloId)}/download/${String(midiaId)}`

/** `01`, `02`, … — two digits, so the outlined box never changes width between 9 and 10. */
const numeroDe = (posicao: number): string => String(posicao + 1).padStart(2, '0')

/**
 * The card's action: the open download itself, or the way to choose between several files.
 *
 * *"O download não exige conta"* (PO, 2026-08-24) is this page's headline decision, so a model
 * with a single file is one click from it. US3's edge case — *"a model with several files
 * offers all of them"* — is the detail page's job (CLR-001), and a card that linked the first
 * file would serve an `.stl` to a visitor who wanted the `.3mf` **and count it** as the
 * download they asked for.
 */
function acaoDe(modelo: Modelo3dDoc, detalhe: string): ReactNode {
  const arquivos = arquivosDe(modelo)
  // `arquivosModelo` is required, so an empty list means every reference was one the scoped
  // client could not resolve. There is nothing to offer, and a dead button is worse than none.
  if (arquivos.length === 0) return null
  const titulo = modelo.titulo ?? ''
  const unico = arquivos.length === 1 ? arquivos[0]?.id : undefined
  const rotulo =
    unico === undefined ? `Ver os ${String(arquivos.length)} arquivos de ${titulo}` : `Baixar ${titulo}`
  return (
    <a
      href={unico === undefined ? detalhe : downloadHref(modelo.id, unico)}
      aria-label={rotulo}
      style={ESTILO.acao}
    >
      {unico === undefined ? 'ARQUIVOS' : 'BAIXAR'}
    </a>
  )
}

/**
 * The author strip: the person's name and `@nomesobrenome` (round 4, 2026-08-24). No level —
 * `perfilMaker` carries none, and a number nobody earned on a public page is worse than its
 * absence. `formatHandle` prints the `@`, in the one place that decides how.
 *
 * The **removed** case is the one T029 created: `autor` is nullable since that migration, and
 * the only thing that empties it is a deletion, so an absent relationship is a person who
 * exercised FR-031 rather than a row that was never filled in. CLR-003 keeps their work up
 * *"with authorship replaced by a tombstone"* — returning `null` here, as this did before,
 * keeps the work up with **no** authorship at all, which reads as content the lab published.
 *
 * A **bare id** stays `null`: that is a populate failure over a living maker, and printing the
 * tombstone for it would announce a deletion nobody performed. The wording comes from
 * `@fablab/ui` so these four hand-drawn bylines and `CardProjeto` cannot drift apart (CHK066).
 */
function autoriaDe(autor: Modelo3dDoc['autor']): ReactNode {
  if (autor === null || autor === undefined) return <span style={ESTILO.autor}>{AUTOR_REMOVIDO}</span>
  const perfil = asDoc<PerfilDoc>(autor)
  if (perfil === null) return null
  return (
    <span style={ESTILO.autor}>
      <span>{perfil.nome ?? ''}</span>
      <span style={ESTILO.handle}>{formatHandle(perfil.handle ?? '')}</span>
    </span>
  )
}

/**
 * One numbered card, from one populated document.
 *
 * `posicao` decides two things: the number in the outlined box, and the loading strategy — the
 * first row is what a visitor sees before scrolling and is the likeliest LCP element here,
 * while everything below the fold waits. Twelve eager thumbnails on a 4G profile is the shape
 * SC-006's budget exists to catch.
 */
function cardDe(modelo: Modelo3dDoc, posicao: number): ReactElement {
  const detalhe = `${BIBLIOTECA_PATH}/${modelo.slug ?? ''}`
  return (
    <li key={modelo.slug ?? posicao} className={CLASSE.card}>
      <span style={ESTILO.numero}>{numeroDe(posicao)}</span>
      {/* "as thumbnails dos modelos 3D mantêm o fundo navy dentro do card branco" (round 2). */}
      <span style={ESTILO.thumb}>
        <img
          src={thumbSrc(modelo.thumbnail)}
          // `midiaImagem` stores no alt text and the title sits beside the render: an alt built
          // from the title makes a screen reader read the same words twice.
          alt=""
          loading={posicao < PRIMEIRA_LINHA ? 'eager' : 'lazy'}
          decoding="async"
          style={ESTILO.thumbImg}
        />
      </span>
      <span style={ESTILO.corpo}>
        <a href={detalhe} style={ESTILO.titulo}>
          {modelo.titulo ?? ''}
        </a>
        <span style={ESTILO.descricao}>{modelo.descricaoCurta ?? ''}</span>
        {autoriaDe(modelo.autor)}
      </span>
      <span style={ESTILO.acoes}>
        {acaoDe(modelo, detalhe)}
        {/* The count, and now the press that answers it (T003, FR-025, US7). Feature 003 drew
            it as text and deferred the click, on the argument recorded here that a card
            rendering the island would ship a client boundary per row. 004 pays that cost
            deliberately and for the whole listing: a heart a visitor can click and get nothing
            back from is the half of US7 that was deferred, and the invitation cannot come from
            markup. The island is the small one FR-024's bound was argued against — two hooks,
            no data of its own (`ALLOWED_ISLANDS` carries the entry and the argument), and the
            page around it stays a server component.

            `isSignedIn` is deliberately not passed: it defaults to the visitor, the only branch
            phase 1 has. The write is T028b's `lib/accounts/curtir.ts`, and `onCurtir` is a
            function — not serialisable across this boundary, and Next refuses it at render. */}
        <LikeButton curtidas={modelo.curtidas ?? 0} surface="light" />
      </span>
    </li>
  )
}

/** The teal sidebar's tag list: `TODOS` and then this organization's own vocabulary, each with
 *  its count. `TODOS` is an aggregate and not a row (nothing seeds it), and every model carries
 *  exactly one required category — so the sum IS the total, where the mockup's `1234` would be
 *  another organization's number on every host. */
function categorias(
  vocabulario: readonly CategoriaDoc[],
  params: ListingParams,
  filtros: Filtros,
): ReactElement {
  const total = vocabulario.reduce((soma, categoria) => soma + (categoria.totalModelos ?? 0), 0)
  const itens = [
    { rotulo: 'TODOS', slug: ALL_CATEGORIES, total },
    ...vocabulario.map((categoria) => ({
      rotulo: categoria.nome ?? '',
      slug: categoria.slug ?? '',
      total: categoria.totalModelos ?? 0,
    })),
  ]
  return (
    <nav aria-label="Categorias" style={ESTILO.categorias}>
      <h2 style={ESTILO.categoriasTitulo}>CATEGORIAS</h2>
      <ul style={ESTILO.categoriaLista}>
        {itens.map((item) => (
          <li key={item.slug}>
            <a
              href={filtroHref(params, filtros, item.slug)}
              // The active state as markup, not only as colour: it is what a screen reader
              // hears, and the pink highlight the mockup draws is unavailable to it.
              aria-current={params.categoria === item.slug ? 'page' : undefined}
              style={ESTILO.categoriaItem}
            >
              <span>{item.rotulo}</span>
              <span style={ESTILO.categoriaTotal}>{item.total}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The sidebar band (`biblioteca-3d.md` § Sidebar esquerda). `--surface-band` and not
 *  `--surface-page`: it is the one surface that must NOT follow the page, which is exactly what
 *  keeps it teal beside the white content area. */
function sidebar(
  vocabulario: readonly CategoriaDoc[],
  params: ListingParams,
  filtros: Filtros,
): ReactElement {
  return (
    <aside className={CLASSE.sidebar} style={ESTILO.sidebar}>
      <h1 style={ESTILO.sidebarTitulo}>
        BIBLIOTECA
        <br />
        3D
      </h1>
      <p style={ESTILO.sidebarTexto}>
        Explore, baixe e imprima modelos 3D criados pela comunidade maker.
      </p>
      {categorias(vocabulario, params, filtros)}
    </aside>
  )
}

/** One dropdown, opened on the value the URL carries so a filtered link renders as filtered. */
function seletor(filtro: FiltroDef, filtros: Filtros): ReactElement {
  return (
    <select
      key={filtro.chave}
      name={filtro.chave}
      aria-label={filtro.rotulo}
      defaultValue={filtros[filtro.chave]}
      style={ESTILO.seletor}
    >
      {filtro.opcoes.map((opcao) => (
        <option key={opcao.value === '' ? 'todos' : opcao.value} value={opcao.value}>
          {opcao.label}
        </option>
      ))}
    </select>
  )
}

/**
 * The filter bar: the search field, then `FILTRAR POR:` and the three dropdowns.
 *
 * A plain GET form, so every value lands in the URL and the result is linkable and reloadable
 * (FR-010) with no JavaScript at all. The submit button is load-bearing rather than decorative:
 * a `<select>` fires no navigation on its own and this page has no client boundary to give it
 * one, so without the button the three dropdowns would apply nothing.
 *
 * The hidden input is what keeps a filtered search filtered: a GET form submits only its own
 * fields, so without it, searching inside `ANIMAIS` silently drops the category the sidebar
 * still shows as active. It is omitted for `TODOS`, which is a UI state and not a row.
 */
function filtrosBar(params: ListingParams, filtros: Filtros): ReactElement {
  return (
    <form method="get" action={BIBLIOTECA_PATH} className={CLASSE.filtros}>
      {params.categoria === ALL_CATEGORIES ? null : (
        <input
          type="hidden"
          name={LISTING_PARAM_KEYS.categoria}
          value={params.categoria}
          readOnly={true}
        />
      )}
      <SearchInput
        label="Buscar modelos 3D"
        placeholder="Buscar modelos 3D..."
        name={LISTING_PARAM_KEYS.busca}
        surface="light"
      />
      <span style={ESTILO.filtrarPor}>FILTRAR POR:</span>
      {FILTROS.map((filtro) => seletor(filtro, filtros))}
      <button type="submit" style={ESTILO.aplicar}>
        APLICAR
      </button>
    </form>
  )
}

type Listagem = { docs: Modelo3dDoc[]; page: number; totalPages: number }

/** The list, the empty body or the error body — exactly one of the three (FR-017, FR-018). */
function resultado(listagem: Listagem | null, params: ListingParams, filtros: Filtros): ReactNode {
  if (listagem === null) {
    return (
      <EmptyState
        surface="light"
        variant="erro"
        titulo="Não foi possível carregar os modelos."
        // The URL that just failed, filters included: a retry that quietly drops them reports
        // success for a different page than the one that broke.
        acao={{
          label: 'Tentar novamente',
          href: bibliotecaHref({ ...params, page: 1 }, filtros),
        }}
      />
    )
  }

  if (listagem.docs.length === 0) {
    return (
      <EmptyState
        surface="light"
        variant="vazio"
        titulo="Nenhum modelo encontrado."
        descricao="Tente outra busca ou limpe os filtros."
        // The clearing action IS the unfiltered URL — no handler, no client boundary.
        acao={{ label: 'Limpar filtros', href: BIBLIOTECA_PATH }}
      />
    )
  }

  return (
    <>
      <ul
        className={CLASSE.lista}
        aria-label="Modelos 3D"
        // The row count is data because CSS cannot compute it, and the vertical numbering
        // depends on it: *"01–05 na coluna esquerda, 06–10 na coluna direita"* is a column-flow
        // grid, which needs to be told how many rows it has. A fixed `repeat(6, …)` would leave
        // six empty rows under a last page holding three models.
        style={{ '--fl-modelos-linhas': Math.ceil(listagem.docs.length / COLUNAS) } as CSSProperties}
      >
        {listagem.docs.map((modelo, posicao) => cardDe(modelo, posicao))}
      </ul>
      <Pagination
        page={listagem.page}
        totalPages={listagem.totalPages}
        // The navy default draws light ink on the white content area (FR-028).
        surface="light"
        hrefFor={(n) => bibliotecaHref({ ...params, page: n }, filtros)}
      />
    </>
  )
}

/** Next hands a page its query string as a promise. */
type BibliotecaPageProps = { readonly searchParams: Promise<RawListingParams> }

/**
 * `/biblioteca-3d` — the public catalogue of the lab's 3D models.
 *
 * @example /biblioteca-3d?categoria=animais&busca=lobo&pagina=2&nivel=iniciante
 */
export default async function Page({ searchParams }: BibliotecaPageProps): Promise<ReactElement> {
  const raw = await searchParams

  // The vocabulary first, because the parser needs it: "which categories exist" is what turns a
  // stranger's query string into state, and it is per organization (US2).
  const vocabulario = await lerOuFalhar<CategoriaDoc[]>(lerCategorias, [])
  const params = parseListingParams(raw, { knownCategories: slugsDe(vocabulario) })
  const filtros = parseFiltros(raw)

  // `null` is "this read failed", which is a different page from "this filter matched nothing".
  const listagem = await lerOuFalhar<Listagem | null>(
    () =>
      listPublic<Modelo3dDoc>({
        collection: 'modelo3d',
        params,
        // `ordem` is a sort, not a filter, and the reader declares no such key — passing it
        // would raise. The two that narrow are passed by the names the URL uses.
        filtros: { nivel: filtros.nivel, formato: filtros.formato },
      }),
    null,
  )

  return (
    <main style={ESTILO.pagina_}>
      <div className={CLASSE.layout}>
        {sidebar(vocabulario, params, filtros)}
        <div className={CLASSE.conteudo}>
          {filtrosBar(params, filtros)}
          {resultado(listagem, params, filtros)}
        </div>
      </div>
      <style href="fablab-biblioteca-3d" precedence="default">
        {BIBLIOTECA_CSS}
      </style>
    </main>
  )
}

/** The class names, in one place: the markup and `BIBLIOTECA_CSS` must agree, and a typo in
 *  either is an unstyled element or a breakpoint that switches nothing. */
const CLASSE = {
  layout: 'fl-biblioteca',
  sidebar: 'fl-biblioteca__sidebar',
  conteudo: 'fl-biblioteca__conteudo',
  filtros: 'fl-biblioteca__filtros',
  lista: 'fl-modelos',
  card: 'fl-modelo',
} as const

/**
 * Everything that needs a breakpoint, as a stylesheet — the rest is style objects below.
 *
 * The split is the one every component in `packages/ui` makes: a media query cannot live in a
 * style object, and a class name is assertable only as text in two files. So the responsive
 * decisions are here and the colour and spacing decisions are data the suite reads. Mobile
 * first, at the three design targets (390 base, 834, 1440) and no other width.
 */
const BIBLIOTECA_CSS = `
.${CLASSE.layout} {
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6);
}
.${CLASSE.conteudo} {
  display: flex; flex-direction: column; gap: var(--space-6); min-width: 0;
  padding: 0 var(--space-5) var(--space-10);
}
.${CLASSE.filtros} {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3);
}
.${CLASSE.lista} {
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5);
  margin: 0; padding: 0; list-style: none;
}
.${CLASSE.card} {
  display: flex; align-items: flex-start; gap: var(--space-4);
  padding: var(--space-4); min-width: 0;
  /* Round 2, 2026-08-23: white card, dark navy outline and the hard offset shadow. The fill is
     the page's own surface, which this page re-declared to white — so the card follows the
     region rather than naming a colour of its own. */
  background: var(--surface-card); border: 1px solid var(--text-on-light);
  border-radius: var(--radius-md); box-shadow: var(--shadow-hard);
}
@media (min-width: 834px) {
  /* "faixa teal … ~1/5 da largura" — the sidebar keeps its column beside the white content. */
  .${CLASSE.layout} { grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); }
  .${CLASSE.lista} {
    grid-template-columns: repeat(${String(COLUNAS)}, minmax(0, 1fr));
    /* The numbering runs DOWN each column, not across the row: "01–05 na coluna esquerda,
       06–10 na coluna direita". Column flow is what makes the DOM order and the drawn order
       agree, so the numbers a visitor reads are the numbers the markup carries. */
    grid-auto-flow: column; grid-template-rows: repeat(var(--fl-modelos-linhas, 1), auto);
  }
}
@media (min-width: 1440px) {
  .${CLASSE.layout} { grid-template-columns: minmax(0, 1fr) minmax(0, 4fr); }
}
`

/**
 * Every colour and spacing decision this page declares, in one object.
 *
 * Style objects rather than a stylesheet, for the reason `Button`, `Chip` and `Tabs` each
 * record: the suite runs at `node` with no DOM, so a class name would be assertable only as
 * text in two files — a check that stays green when the rule behind it is wrong. As data, the
 * decision is what the test reads. Every colour is a token (FR-027); there is no hex here and
 * there must never be one.
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore: `pagina` is already the URL parameter's name in this file, and two
  // meanings for one word is how the wrong one gets used.
  //
  // The page re-declares the surface ROLE rather than painting a colour, so everything derived
  // from it follows into the light treatment. `--surface-card` is re-declared BESIDE it and
  // that is not redundancy: var() in a custom property is substituted where the property is
  // DECLARED, so `--surface-card: var(--surface-page)` at `:root` already computed to navy and
  // the cards would inherit that navy however this region redefines the page beneath them.
  pagina_: {
    '--surface-page': 'var(--surface-inverted)', '--surface-card': 'var(--surface-inverted)',
    '--focus-ring-color': 'var(--text-on-light)',
    // T028 / FR-023: the ring follows the region, exactly as the two surfaces above do. The
    // `:root` default is the accent, which scores 2.05:1 on this white content area — a ring
    // nobody can see. Navy scores 16.63:1 here and is the ink this page already writes in.
    background: 'var(--surface-page)', color: 'var(--text-on-light)',
    display: 'flex', flexDirection: 'column',
  } as CSSProperties,
  sidebar: {
    background: 'var(--surface-band)',
    // The ring must follow the BAND, not only the page. `--focus-ring-color` resolves from
    // `:root` (or the page's own override) to the accent, and the accent on this teal scores
    // **1.13:1** — WCAG 1.4.11 asks 3:1 for a focus indicator, so the ring on every target
    // inside this band was invisible while the page-level override two rules away made the
    // rest of the page correct. Navy on teal is 7.18:1 and is the documented pair.
    '--focus-ring-color': 'var(--text-on-light)',
    // Navy on teal is the documented pair; the light-on-dark default would be unreadable here.
    color: 'var(--text-on-light)',
    padding: 'var(--space-8) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-5)',
  } as CSSProperties,
  sidebarTitulo: {
    margin: 0, fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)', textTransform: 'uppercase',
  },
  sidebarTexto: {
    margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', maxWidth: '34ch',
  },
  categorias: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    // "card navy com contorno claro, cantos arredondados" — the one navy block inside the band.
    background: 'var(--color-navy)', color: 'var(--text-on-dark)',
    // A navy island on a light page. The page re-declares `--focus-ring-color` to navy for its
    // white surface, so a target in here would ring navy on navy — 1.00:1. The accent is
    // 8.12:1 on navy and is what `:root` uses for exactly this surface, so the island hands
    // the ring back rather than inventing a third colour.
    '--focus-ring-color': 'var(--color-primary)',
    border: '1px solid var(--color-claro)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-4)',
  } as CSSProperties,
  categoriasTitulo: {
    margin: 0, fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)', letterSpacing: '0.08em',
  },
  categoriaLista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-1)' },
  categoriaItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)',
    // 44px on the compact breakpoints (FR-022): a tag is a touch target before it is a link.
    minHeight: '44px', padding: '0 var(--space-2)', borderRadius: 'var(--radius-sm)',
    color: 'inherit', textDecoration: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', textTransform: 'uppercase',
  },
  categoriaTotal: { fontFamily: 'var(--font-body)', opacity: 0.8 },
  filtrarPor: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)', color: 'var(--text-on-light)',
  },
  seletor: {
    minHeight: '44px', padding: '0 var(--space-3)', borderRadius: 'var(--radius-sm)',
    background: 'var(--color-claro)', color: 'var(--text-on-light)',
    border: '1px solid var(--text-on-light)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
  },
  aplicar: {
    minHeight: '44px', padding: '0 var(--space-4)', borderRadius: 'var(--radius-md)',
    // Navy ink ON the accent, never the accent AS ink (FR-028).
    background: 'var(--color-primary)', color: 'var(--text-on-light)',
    // On the accent fill the ring would be 1.00:1 — see PRIMARY_BUTTON_STYLE, which carries the
    // same override for every CTA that spreads it. This region paints the fill by hand.
    '--focus-ring-color': 'var(--color-navy)',
    border: '1px solid var(--text-on-light)', cursor: 'pointer',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)',
  } as CSSProperties,
  numero: {
    // Navy, not the mockup's pink: this is small text on white (FR-028).
    color: 'var(--text-on-light)', border: '1px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)', padding: 'var(--space-1) var(--space-2)', lineHeight: 1,
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)',
  },
  thumb: {
    // The render keeps its navy ground inside the white card (round 2, 2026-08-23).
    background: 'var(--color-navy)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
    // A navy island on a light page. The page re-declares `--focus-ring-color` to navy for its
    // white surface, so a target in here would ring navy on navy — 1.00:1. The accent is
    // 8.12:1 on navy and is what `:root` uses for exactly this surface, so the island hands
    // the ring back rather than inventing a third colour.
    '--focus-ring-color': 'var(--color-primary)',
    flex: '0 0 auto', width: '96px', height: '96px', display: 'block',
  } as CSSProperties,
  thumbImg: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
  corpo: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0, flex: 1 },
  titulo: {
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', textTransform: 'uppercase',
    color: 'var(--text-on-light)', textDecoration: 'none',
  },
  descricao: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-on-light)' },
  autor: { display: 'flex', gap: 'var(--space-2)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  handle: { opacity: 0.8 },
  acoes: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    // "coluna de ações à direita, separada por divisória".
    borderInlineStart: '1px solid var(--text-on-light)', paddingInlineStart: 'var(--space-4)',
  },
  acao: {
    display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '0 var(--space-3)',
    // "ícone de seta para baixo em moldura teal" — the frame is teal, the label navy.
    border: '1px solid var(--color-teal)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-on-light)', textDecoration: 'none',
    fontFamily: 'var(--font-display)', fontSize: 'var(--text-sm)',
  },
  curtidas: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--text-on-light)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  },
  /**
   * The heart, in navy — and NOT in the mockup's pink.
   *
   * `biblioteca-3d.md` decides the number is navy (round 2) and leaves the pink `♥` beside it
   * marked **(proposta)**, so the decided half is the half that ships. It is also the only
   * reading FR-028 allows here: a `♥` is a glyph, so "nada de rosa em texto pequeno sobre
   * branco" covers it, and `--color-primary`'s default pink measures about 1.8:1 on white —
   * a mark most readers would lose entirely, decoration or not.
   */
  coracao: { color: 'var(--text-on-light)' },
}
