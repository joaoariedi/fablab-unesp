import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import type { CardProjetoAutor } from '@fablab/ui'
import { CardProjeto, EmptyState, LikeButton, ListingGrid, Pagination, SearchInput, Tabs } from '@fablab/ui'

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
// Deep import, exactly as `layout.tsx` and the Projetos listing do it and for the same reason:
// the anonymous read path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'
import { dataCurta } from './data-publicacao'

/**
 * T019 / FR-005, FR-010, FR-021, FR-029, US1, US2 — the Artigos listing.
 *
 * `spec.md` FR-005: *"Artigos: same listing shape, its own categories, cover with category chip
 * and date"*. `artigos.md` fixes the bands: the **hero** (*"Título display navy: `ARTIGOS`"*
 * with the two-line paragraph), the **filter bar** (tabs plus *"campo de busca arredondado …
 * placeholder `Buscar artigos...`"*), the **grid** (*"3 colunas"*, two at tablet, one at
 * mobile) and the states (*"`Nenhum artigo encontrado.` … `Não foi possível carregar os
 * artigos.`"*).
 *
 * ── What "same listing shape" does and does not mean ────────────────────────────────────────
 *
 * The shape is shared and is therefore not restated: `listPublic` reads the page,
 * `parseListingParams` reads the URL, `Tabs`/`SearchInput`/`ListingGrid`/`Pagination` draw the
 * chrome. Four things are genuinely this page's own and each is here for a reason:
 *
 *   1. **The vocabulary is `categoriaArtigo`, sorted by `ordem`.** That collection carries an
 *      ordering field where `categoriaProjeto` does not, and `artigos.md` fixes the tab order
 *      as `CULTURA MAKER · EDUCAÇÃO · TECNOLOGIA · INOVAÇÃO SOCIAL` — which is not alphabetical.
 *      The Projetos listing sorts by name precisely because it has nothing better; this one
 *      does.
 *   2. **The card carries a date.** *"Faixa de metadados sobre a base da capa: chip de
 *      categoria rosa … + data de publicação em caps ao lado"*. It rides in the cover slot
 *      because that is where the design puts it — over the image, beside the chip
 *      `CardProjeto` already draws there. See {@link ESTILO.data}.
 *   3. **The author is real.** `artigo.autor` → `perfilMaker` is required and populated at
 *      `depth: 1`, so the strip shows a person. `projeto` has no author field at all yet and
 *      credits the lab; doing that here would discard data the page was handed.
 *   4. **`PUBLICAÇÃO` reaches the chip without reaching the tabs.** CLR-009 makes it a category
 *      record *"shown on the card chip, absent from the tab set"*, and `artigos.md` says it
 *      twice: the tab order is fixed without it, and *"`PUBLICAÇÃO` **não** consta nas tabs de
 *      categoria"*. Because it is a real row, the read that builds the tabs returns it like any
 *      other — so something here has to leave it out. See {@link CATEGORIAS_FORA_DAS_TABS}.
 *
 * A server component, like every listing (plan § "Implementation approach"): the tabs, the
 * pagination and the empty state's action are anchors, and the search is a GET form. The page
 * ships no JavaScript of its own (FR-024).
 */

export const metadata = { title: 'ARTIGOS — Fab Lab CITe Bauru' }

/** This listing's own path. Every link on the page is built from it, so the route moves in one
 *  edit and no href is left pointing at the old one. */
export const ARTIGOS_PATH = '/artigos'

/**
 * The category vocabulary as this page reads it — `nome` for the tab, `slug` for the URL.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 */
type CategoriaDoc = { readonly nome?: string; readonly slug?: string }

/** One media document as `depth: 1` populates it. `sizes.card` is the derivative
 *  `midiaImagem` generates for exactly this grid. */
type MidiaDoc = {
  readonly url?: string | null
  readonly sizes?: { readonly card?: { readonly url?: string | null } }
}

/** The author profile as `depth: 1` populates it. `nivel` is deliberately absent — see
 *  {@link NIVEL_PENDENTE}. */
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/** One article as the listing reader returns it, populated one level. */
type ArtigoDoc = {
  readonly titulo?: string
  readonly slug?: string
  readonly resumo?: string
  readonly categoria?: CategoriaDoc | number | null
  readonly capa?: MidiaDoc | number | null
  readonly autor?: PerfilDoc | number | null
  readonly dataPublicacao?: string | null
  readonly curtidas?: number
}

/**
 * The level the strip shows until feature 005 gives a profile one.
 *
 * `CardProjetoAutor.nivel` is required — the mockups draw `NÍVEL n` on every card — and
 * `PerfilMaker.ts` states the omission in its own header: *"`nivel`/`xp`/`skills` are"* feature
 * 005's. The floor of the 1–10 scale is the only honest stand-in: any other number reads as
 * earned progress nobody earned.
 *
 * **Delete this the moment `nivel` exists** and read it off the profile in {@link autorDe}.
 */
const NIVEL_PENDENTE = 1

/**
 * The author strip when the relationship arrived as a bare id.
 *
 * `autor` is required on the collection, so this is a populate failure rather than an absent
 * author — but the card's strip is required too, and a `@undefined` under a published article
 * is worse than crediting the lab. The same choice the Projetos listing records, arrived at
 * from the other direction.
 */
const AUTORIA_PENDENTE: CardProjetoAutor = { nome: 'Fab Lab', handle: 'fablab', nivel: NIVEL_PENDENTE }

/**
 * How many category rows a tab bar may hold.
 *
 * `artigos.md` names five, so this is a guard against an unbounded read rather than a paging
 * strategy: a vocabulary that outgrows it is a design problem (a tab bar nobody can scan), not
 * a pagination one.
 */
const CATEGORIA_LIMIT = 50

/** The widest row the grid draws (LISTING_GRID_COLUMNS.desktop). */
const PRIMEIRA_LINHA = 3

/** A populated relationship, or `null` when it arrived as a bare id. */
const asDoc = <T,>(value: T | number | string | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/**
 * Run a public read, and answer the two failures a visitor can actually meet.
 *
 * An **unresolved host** is 404 for the whole site, the same answer `layout.tsx` gives: serving
 * one organization's page on another's hostname is the failure feature 000's US4 forbids, and
 * it is worse than an error because nobody would notice it. Anything else is an outage of this
 * one read, and FR-018 says the page reports it in place with a retry — the hero, the tabs and
 * the search field stay usable, so the visitor can reach a filter that works.
 */
async function lerOuFalhar<T>(ler: () => Promise<T>, aoFalhar: T): Promise<T> {
  try {
    return await ler()
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split `currentOrganization()` makes.
    console.warn('[artigos] a public read failed; rendering the error state.', erro)
    return aoFalhar
  }
}

/**
 * This organization's article categories, through the anonymous choke point.
 *
 * The one read this page issues directly, and the reason the registry declares `publicList` on
 * `categoriaArtigo`: *a page LISTS it*. Hard-coding the five names `artigos.md` draws would put
 * CITe's vocabulary on every host — the *"showing another organization's category"* half of
 * US2's error case, arriving through the back door.
 *
 * Sorted by `ordem`, which is what that field is for (*"Ordem das tabs"*, `artigos.md` §
 * Coleção `categoria_artigo`). Alphabetical would put `CULTURA MAKER` after `EDUCAÇÃO`.
 */
async function lerCategorias(): Promise<CategoriaDoc[]> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<CategoriaDoc>({
    collection: 'categoriaArtigo',
    // The tabs need two strings and nothing else; there is nothing to populate.
    depth: 0,
    limit: CATEGORIA_LIMIT,
    sort: 'ordem',
  })
  return docs
}

/** The slugs `parseListingParams` will accept. Anything else in the URL narrows to `TODOS`. */
const slugsDe = (categorias: readonly CategoriaDoc[]): string[] =>
  categorias.map((categoria) => categoria.slug).filter((slug): slug is string => Boolean(slug))

/**
 * The URL for a category, with the search kept and the page number dropped.
 *
 * Page 3 of `TODOS` is not page 3 of `EDUCAÇÃO`, so carrying the number across a filter change
 * lands the visitor on a page that may not exist. The term survives because the visitor did not
 * clear it — changing the category is narrowing a search, not abandoning one.
 */
const filtroHref = (params: ListingParams, categoria: string): string =>
  listingHref(ARTIGOS_PATH, { ...params, categoria, page: 1 })

/**
 * Categories that exist as rows but are not offered as tabs (CLR-009).
 *
 * `PUBLICAÇÃO` is the case the clarification was written for: it is *"a row in
 * `categoria_artigo`, shown on the card chip, absent from the tab set"*, because the mockup
 * draws the chip carrying a value the tabs do not list. The alternative CLR-009 rejected was a
 * distinct content type, which would have meant a new collection in feature 002 — already
 * shipped.
 *
 * A slug and not a `nome`: the label is editorial and gets retyped, the slug is the identifier
 * the URL already uses. `tests/public/artigos-page.test.ts` seeds this exact row, because a
 * fixture that omits it makes the rule unfalsifiable — which is how the first draft passed
 * while building the tab set from every row the read returned.
 *
 * A set, not a constant, so the second such category is a line rather than a branch. It is
 * deliberately NOT a schema flag: feature 003 adds no migrations (tasks.md § "Read before
 * starting", item 5), and a column on a shipped collection is 002's to add if the vocabulary
 * ever needs to carry this decision itself.
 */
export const CATEGORIAS_FORA_DAS_TABS: ReadonlySet<string> = new Set(['publicacao'])

/**
 * `TODOS` first, then the vocabulary in its declared order, minus the ones that are chips only.
 *
 * The excluded rows stay reachable by URL on purpose: `?categoria=publicacao` still filters,
 * because the row is a real category and the reader has no reason to refuse it. What CLR-009
 * removes is the offer, not the filter.
 */
function abas(categorias: readonly CategoriaDoc[], params: ListingParams) {
  return [
    { label: 'Todos', href: filtroHref(params, ALL_CATEGORIES) },
    ...categorias
      .filter((categoria) => !CATEGORIAS_FORA_DAS_TABS.has(categoria.slug ?? ''))
      .map((categoria) => ({
        label: categoria.nome ?? '',
        href: filtroHref(params, categoria.slug ?? ''),
      })),
  ]
}

/** The cover URL: the generated card derivative, or the original when none was made. */
function capaSrc(imagem: ArtigoDoc['capa']): string {
  const doc = asDoc<MidiaDoc>(imagem)
  return doc?.sizes?.card?.url ?? doc?.url ?? ''
}

/** The category name for the chip, or nothing when the relationship arrived unpopulated. */
function categoriaNome(categoria: ArtigoDoc['categoria']): string {
  return asDoc<CategoriaDoc>(categoria)?.nome ?? ''
}

/** The person the article credits, or the lab when the profile did not arrive. */
function autorDe(autor: ArtigoDoc['autor']): CardProjetoAutor {
  const perfil = asDoc<PerfilDoc>(autor)
  if (!perfil?.nome) return AUTORIA_PENDENTE
  return { nome: perfil.nome, handle: perfil.handle ?? '', nivel: NIVEL_PENDENTE }
}

/**
 * The cover, with the publication date over it.
 *
 * The date rides **inside the cover slot** rather than beside the title because that is where
 * the design puts it: `CardProjeto` draws the category chip over the bottom of the media box,
 * and `artigos.md` draws the date on that same strip. The inline `width`/`height` are not
 * decoration — `.fl-card-projeto__media > *` stretches every child of that box to fill it,
 * a rule written for the cover image, and an absolutely positioned date inherits it.
 *
 * `posicao` decides only the loading strategy: the first row is what a visitor sees before
 * scrolling and is the likeliest LCP element on this page, so it is fetched eagerly, while
 * everything below the fold waits. Twelve eager covers on a 4G profile is the shape SC-006's
 * budget exists to catch.
 */
function capa(artigo: ArtigoDoc, posicao: number): ReactNode {
  const data = dataCurta(artigo.dataPublicacao)
  return (
    <>
      <img
        src={capaSrc(artigo.capa)}
        // `midiaImagem` stores no alt text, and the title sits directly beneath the cover: an
        // alt built from the title makes a screen reader read the same words twice.
        alt=""
        loading={posicao < PRIMEIRA_LINHA ? 'eager' : 'lazy'}
        decoding="async"
      />
      {data === '' ? null : (
        // `dateTime` carries the instant a machine can read; the visible string is abbreviated
        // and localised, and nothing else on the card holds the date.
        <time dateTime={artigo.dataPublicacao ?? undefined} style={ESTILO.data}>
          {data}
        </time>
      )}
    </>
  )
}

/** One card, from one populated document. */
function cardDe(artigo: ArtigoDoc, posicao: number): ReactElement {
  return (
    <CardProjeto
      key={artigo.slug ?? posicao}
      titulo={artigo.titulo ?? ''}
      descricao={artigo.resumo ?? ''}
      categoria={categoriaNome(artigo.categoria)}
      href={`${ARTIGOS_PATH}/${artigo.slug ?? ''}`}
      capa={capa(artigo, posicao)}
      autor={autorDe(artigo.autor)}
      curtidas={artigo.curtidas ?? 0}
      // The island in the slot the card already offers (T003, FR-025, US7): a visitor's press
      // opens the account invitation and the number stays exactly where the server put it.
      // `curtidas` above is still passed — it is the card's own static count, the markup this
      // page falls back to the day the slot is not supplied, and `CardProjeto` requires it.
      //
      // Nothing else is passed on purpose. `isSignedIn` defaults to the visitor, which is the
      // only branch phase 1 has: the write lives in T028b's `lib/accounts/curtir.ts`, and
      // `onCurtir` is a function — handing one from a server component to a client one is not
      // serialisable and Next refuses it at render.
      curtir={<LikeButton curtidas={artigo.curtidas ?? 0} />}
    />
  )
}

/**
 * The hero band (`artigos.md` § Hero).
 *
 * `--surface-band` and not `--surface-page`: the band is the one surface that must not follow
 * the page. The ink is `--text-on-light`, because navy on teal is the documented pair — the
 * light-on-dark default would be unreadable here.
 *
 * The isometric composition the mockup draws to the right is deliberately absent: it is art
 * that does not exist as an asset yet, and an empty box holding its place would be worse than
 * the band without it.
 */
function hero(): ReactElement {
  return (
    <section style={ESTILO.hero}>
      <h1 style={ESTILO.heroTitulo}>ARTIGOS</h1>
      <p style={ESTILO.heroTexto}>
        Conteúdos, reflexões e referências
        <br />
        para inspirar, aprender e transformar.
      </p>
    </section>
  )
}

/**
 * The filter bar: the tabs on the left, the search field on the right.
 *
 * The search is a plain GET form, so the term lands in the URL and the result is linkable and
 * reloadable (FR-010) with no JavaScript at all. The hidden input is what keeps a filtered
 * search filtered: a GET form submits only its own fields, so without it, searching inside
 * `EDUCAÇÃO` silently drops the category the tab bar still shows as active. It is omitted for
 * `TODOS`, which is a UI state and not a row.
 */
function filtros(categorias: readonly CategoriaDoc[], params: ListingParams): ReactElement {
  return (
    <section style={ESTILO.filtros}>
      <Tabs
        label="Categorias de artigos"
        items={abas(categorias, params)}
        activeHref={filtroHref(params, params.categoria)}
      />
      <form method="get" action={ARTIGOS_PATH} style={ESTILO.busca}>
        {params.categoria === ALL_CATEGORIES ? null : (
          <input
            type="hidden"
            name={LISTING_PARAM_KEYS.categoria}
            value={params.categoria}
            readOnly={true}
          />
        )}
        <SearchInput
          label="Buscar artigos"
          placeholder="Buscar artigos..."
          name={LISTING_PARAM_KEYS.busca}
        />
      </form>
    </section>
  )
}

/** The grid, the empty body or the error body — exactly one of the three (FR-017, FR-018). */
function resultado(
  listagem: { docs: ArtigoDoc[]; page: number; totalPages: number } | null,
  params: ListingParams,
): ReactNode {
  if (listagem === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar os artigos."
        // The URL that just failed, filter included: a retry that quietly drops the filter
        // reports success for a different page than the one that broke.
        acao={{ label: 'Tentar novamente', href: listingHref(ARTIGOS_PATH, { ...params, page: 1 }) }}
      />
    )
  }

  if (listagem.docs.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhum artigo encontrado."
        descricao="Tente outra categoria ou limpe a busca."
        acao={{ label: 'Limpar filtros', href: ARTIGOS_PATH }}
      />
    )
  }

  return (
    <>
      <ListingGrid label="Artigos">
        {listagem.docs.map((artigo, posicao) => cardDe(artigo, posicao))}
      </ListingGrid>
      {/* The shared control (T010), never a second copy of the window: `hrefFor` is the whole
          of the URL contract, so the filter and the search term ride along and the control
          itself never learns what a listing URL looks like. */}
      <Pagination
        page={listagem.page}
        totalPages={listagem.totalPages}
        hrefFor={(n) => listingHref(ARTIGOS_PATH, { ...params, page: n })}
      />
    </>
  )
}

/** Next hands a page its query string as a promise. */
type ArtigosPageProps = { readonly searchParams: Promise<RawListingParams> }

/**
 * `/artigos` — the editorial listing.
 *
 * @example /artigos?categoria=educacao&busca=gamificação&pagina=2
 */
export default async function Page({ searchParams }: ArtigosPageProps): Promise<ReactElement> {
  const raw = await searchParams

  // The vocabulary first, because the parser needs it: "which categories exist" is what turns a
  // stranger's query string into state, and it is per organization (US2).
  const categorias = await lerOuFalhar<CategoriaDoc[]>(lerCategorias, [])
  const params = parseListingParams(raw, { knownCategories: slugsDe(categorias) })

  // `null` is "this read failed", which is a different page from "this filter matched nothing".
  const listagem = await lerOuFalhar<{
    docs: ArtigoDoc[]
    page: number
    totalPages: number
  } | null>(() => listPublic<ArtigoDoc>({ collection: 'artigo', params }), null)

  return (
    <main style={ESTILO.pagina_}>
      {hero()}
      {filtros(categorias, params)}
      <section style={ESTILO.conteudo}>{resultado(listagem, params)}</section>
    </main>
  )
}

/**
 * Every style this page declares, in one object.
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
  pagina_: { display: 'flex', flexDirection: 'column' },
  hero: {
    background: 'var(--surface-band)',
    // The ring must follow the BAND, not only the page. `--focus-ring-color` resolves from
    // `:root` (or the page's own override) to the accent, and the accent on this teal scores
    // **1.13:1** — WCAG 1.4.11 asks 3:1 for a focus indicator, so the ring on every target
    // inside this band was invisible while the page-level override two rules away made the
    // rest of the page correct. Navy on teal is 7.18:1 and is the documented pair.
    '--focus-ring-color': 'var(--text-on-light)',
    color: 'var(--text-on-light)',
    padding: 'var(--space-10) var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  } as CSSProperties,
  heroTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  heroTexto: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    // Two lines in the mockup; measured in characters so it holds at every breakpoint.
    maxWidth: '46ch',
  },
  filtros: {
    display: 'flex',
    // Wraps rather than scrolling as a whole: below the tablet target the bar becomes the tabs
    // on one row (they scroll on their own, `TABS_STYLE`) and the full-width field beneath.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-6) var(--space-5)',
  },
  busca: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  conteudo: { padding: '0 var(--space-5) var(--space-10)' },
  data: {
    // The metadata strip's right half, opposite the chip `CardProjeto` draws at the start.
    position: 'absolute',
    insetInlineEnd: 'var(--space-3)',
    insetBlockEnd: 'var(--space-3)',
    // `.fl-card-projeto__media > *` stretches every child of the media box to fill it — a rule
    // meant for the cover image. Without these two the date would cover the whole photo.
    width: 'auto',
    height: 'auto',
    // "sobre fundo escuro translúcido" (artigos.md § Grid): mixed from the navy token so the
    // caps stay legible over any photograph, without introducing a colour of its own.
    background: 'color-mix(in srgb, var(--color-navy) 70%, transparent)',
    color: 'var(--color-claro)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-2)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xs)',
  },
}
