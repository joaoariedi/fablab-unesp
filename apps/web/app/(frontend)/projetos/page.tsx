import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { CardProjeto, EmptyState, ListingGrid, Pagination, SearchInput, Tabs } from '@fablab/ui'

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
// Deep import, exactly as `layout.tsx` does it and for the same reason: the anonymous read
// path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'

/**
 * T012 / FR-004, FR-010, FR-021, FR-029, US1, US2 — the Projetos listing.
 *
 * `projetos.md` fixes the four bands: the **hero** (*"faixa teal … título display navy em duas
 * linhas `PROJETOS` / `DO LAB`"* plus the invitation paragraph), the **filter bar** (*"tabs de
 * categoria em caps display … à direita, campo de busca arredondado … placeholder `Buscar
 * projetos...`"*), the **grid** (*"3 colunas"*, two at tablet, one at mobile) and the states
 * (*"Vazio: `Nenhum projeto encontrado.` … Erro: `Não foi possível carregar os projetos.`"*).
 *
 * ── A server component, and the reason that is not an accident ──────────────────────────────
 *
 * `plan.md` § "Implementation approach": *"Every listing is a React Server Component reading
 * through `getPublicScopedPayloadForRSC`. Filters, tabs, pagination and the calendar's view
 * switch are **links**, so they need no client boundary."* Every control on this page is
 * therefore an anchor or a plain form: the tab bar navigates, the pagination navigates, the
 * empty state's `LIMPAR FILTROS` navigates, and the search field is a GET form. The page ships
 * no JavaScript of its own, which is what makes FR-024 true here and what CLR-003 bought when
 * it chose numbered pagination over `CARREGAR MAIS`.
 *
 * ── Two integration gaps this page has to survive, named rather than papered over ────────────
 *
 * 1. **`projeto` has no author.** `Projeto.ts` defers `autor` → `perfilMaker` to feature 005
 *    (*"`autor` → `perfilMaker` (T042) … all feature 005"*) because Payload throws at config
 *    load for a relationship whose target does not exist. `CardProjeto.autor` is required, since
 *    the design draws the strip on every card. See {@link AUTORIA_PENDENTE} for what the card
 *    credits until the field lands, and why it is not an invented maker.
 * 2. ~~**`Pagination` (T010) is not on disk.**~~ **Closed.** T010 landed the shared control and
 *    this page's interim `janela`/`paginacao` pair was deleted in the same change, exactly as
 *    the forwarding address promised — `<Pagination hrefFor={…} />` now draws the bar and the
 *    hrefs still come from `listingHref`, which was always the whole contract. Two things moved
 *    with it, deliberately: the window widened from the interim page±1 to the component's five
 *    numbers (the mockup's `1 2 3 4 5 … 124`, and a fixed width so the targets stop sliding
 *    under the cursor), and `‹`/`›` appeared, which the interim bar never drew. §6 of
 *    `tests/public/projetos-page.test.ts` was corrected to the new contract in the same commit
 *    — a green test defending the window this page no longer draws is the failure that rule
 *    exists for.
 */

export const metadata = { title: 'PROJETOS — Fab Lab CITe Bauru' }

/** This listing's own path. Every link on the page is built from it, so the route moves in one
 *  edit and no href is left pointing at the old one. */
export const PROJETOS_PATH = '/projetos'

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

/** One project as the listing reader returns it, populated one level. */
type ProjetoDoc = {
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly categoria?: CategoriaDoc | number | null
  readonly imagemCapa?: MidiaDoc | number | null
  readonly curtidas?: number
}

/**
 * The author strip, until feature 005 gives the collection an author.
 *
 * `CardProjeto.autor` is required — the mockups draw the strip on every card — and `projeto`
 * carries no `autor` field at all yet. The two honest options were a fabricated maker (a name,
 * an `@handle` and a level nobody earned, on a public page) or crediting the lab itself; this
 * is the second. The level is the floor of the 1–10 scale rather than a number that reads as
 * earned progress, and there is no avatar, because inventing one would be the same lie in art.
 *
 * **Delete this the moment `autor` exists**: {@link cardDe} should read the populated profile.
 */
const AUTORIA_PENDENTE = { nome: 'Fab Lab', handle: 'fablab', nivel: 1 } as const

/**
 * How many category rows a tab bar may hold.
 *
 * `projetos.md` names five and `categoriaProjeto` has no ordering field, so this is a guard
 * against an unbounded read rather than a paging strategy: a vocabulary that outgrows it is a
 * design problem (a tab bar nobody can scan), not a pagination one.
 */
const CATEGORIA_LIMIT = 50

/** The widest row the grid draws (LISTING_GRID_COLUMNS.desktop). */
const PRIMEIRA_LINHA = 3

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
    console.warn('[projetos] a public read failed; rendering the error state.', erro)
    return aoFalhar
  }
}

/**
 * This organization's project categories, through the anonymous choke point.
 *
 * The one read this page issues directly, and the reason T004 declared `publicList` on
 * `categoriaProjeto`: *a page LISTS it*. Hard-coding the five names `projetos.md` draws would
 * put CITe's vocabulary on every host — the *"showing another organization's category"* half of
 * US2's error case, arriving through the back door.
 *
 * Sorted by name because the collection carries no ordering field. The mockup's order
 * (`IMPRESSÃO 3D` · `CORTE A LASER` · `SERIGRAFIA` · `MÓVEIS` · `ELETRÔNICA`) is editorial and
 * has nowhere to live yet; alphabetical is at least stable across requests, which an unsorted
 * read is not.
 */
async function lerCategorias(): Promise<CategoriaDoc[]> {
  const db = await getPublicScopedPayloadForRSC()
  const { docs } = await db.find<CategoriaDoc>({
    collection: 'categoriaProjeto',
    // The tabs need two strings and nothing else; there is nothing to populate.
    depth: 0,
    limit: CATEGORIA_LIMIT,
    sort: 'nome',
  })
  return docs
}

/** The slugs `parseListingParams` will accept. Anything else in the URL narrows to `TODOS`. */
const slugsDe = (categorias: readonly CategoriaDoc[]): string[] =>
  categorias.map((categoria) => categoria.slug).filter((slug): slug is string => Boolean(slug))

/**
 * The URL for a category, with the search kept and the page number dropped.
 *
 * Page 3 of `TODOS` is not page 3 of `SERIGRAFIA`, so carrying the number across a filter change
 * lands the visitor on a page that may not exist. The term survives because the visitor did not
 * clear it — changing the category is narrowing a search, not abandoning one.
 */
const filtroHref = (params: ListingParams, categoria: string): string =>
  listingHref(PROJETOS_PATH, { ...params, categoria, page: 1 })

/** `TODOS` first, then the vocabulary — the order `projetos.md` fixes for the bar. */
function abas(categorias: readonly CategoriaDoc[], params: ListingParams) {
  return [
    { label: 'Todos', href: filtroHref(params, ALL_CATEGORIES) },
    ...categorias.map((categoria) => ({
      label: categoria.nome ?? '',
      href: filtroHref(params, categoria.slug ?? ''),
    })),
  ]
}

/** The cover URL: the generated card derivative, or the original when none was made. */
function capaSrc(imagem: ProjetoDoc['imagemCapa']): string {
  if (typeof imagem !== 'object' || imagem === null) return ''
  return imagem.sizes?.card?.url ?? imagem.url ?? ''
}

/** The category name for the chip, or nothing when the relationship arrived unpopulated. */
function categoriaNome(categoria: ProjetoDoc['categoria']): string {
  return typeof categoria === 'object' && categoria !== null ? (categoria.nome ?? '') : ''
}

/**
 * One card, from one populated document.
 *
 * `posicao` decides only the loading strategy: the first row is what a visitor sees before
 * scrolling and is the likeliest LCP element on this page, so it is fetched eagerly, while
 * everything below the fold waits. Twelve eager covers on a 4G profile is the shape SC-006's
 * budget exists to catch.
 */
function cardDe(projeto: ProjetoDoc, posicao: number): ReactElement {
  const src = capaSrc(projeto.imagemCapa)
  return (
    <CardProjeto
      key={projeto.slug ?? posicao}
      titulo={projeto.titulo ?? ''}
      descricao={projeto.descricaoCurta ?? ''}
      categoria={categoriaNome(projeto.categoria)}
      href={`${PROJETOS_PATH}/${projeto.slug ?? ''}`}
      capa={
        <img
          src={src}
          // `midiaImagem` stores no alt text, and the title sits directly beneath the photo:
          // an alt built from the title makes a screen reader read the same words twice. An
          // empty alt is the correct markup for an image the adjacent text already names.
          alt=""
          loading={posicao < PRIMEIRA_LINHA ? 'eager' : 'lazy'}
          decoding="async"
        />
      }
      autor={AUTORIA_PENDENTE}
      curtidas={projeto.curtidas ?? 0}
    />
  )
}

/**
 * The hero band (`projetos.md` § Hero).
 *
 * `--surface-band` and not `--surface-page`: the band is the one surface that must not follow
 * the page, which is what keeps it teal on the two light pages that reuse this shape. The ink
 * is `--text-on-light`, because navy on teal is the documented pair — the light-on-dark default
 * would be unreadable here.
 *
 * The isometric composition the mockup draws to the right is deliberately absent: it is art
 * that does not exist as an asset yet, and an empty box holding its place would be worse than
 * the band without it.
 */
function hero(): ReactElement {
  return (
    <section style={ESTILO.hero}>
      <h1 style={ESTILO.heroTitulo}>
        PROJETOS
        <br />
        DO LAB
      </h1>
      <p style={ESTILO.heroTexto}>
        Conheça projetos incríveis desenvolvidos por nossos makers. Inspire-se!
      </p>
    </section>
  )
}

/**
 * The filter bar: the tabs on the left, the search field on the right.
 *
 * The search is a plain GET form, so the term lands in the URL and the result is linkable and
 * reloadable (FR-010) with no JavaScript at all. FR-020's 300ms debounce needs `SearchInput`
 * itself to become the island the plan's file table describes (`SearchInput.tsx` → `'use
 * client'`); that is that component's change, in `packages/ui`, and not this page's.
 *
 * The hidden input is what keeps a filtered search filtered: a GET form submits only its own
 * fields, so without it, searching inside `CORTE A LASER` silently drops the category the tab
 * bar still shows as active. It is omitted for `TODOS`, which is a UI state and not a row —
 * submitting it would write `?categoria=TODOS`, a longer URL for the state the bare path names.
 */
function filtros(categorias: readonly CategoriaDoc[], params: ListingParams): ReactElement {
  return (
    <section style={ESTILO.filtros}>
      <Tabs
        label="Categorias de projetos"
        items={abas(categorias, params)}
        activeHref={filtroHref(params, params.categoria)}
      />
      <form method="get" action={PROJETOS_PATH} style={ESTILO.busca}>
        {params.categoria === ALL_CATEGORIES ? null : (
          <input
            type="hidden"
            name={LISTING_PARAM_KEYS.categoria}
            value={params.categoria}
            readOnly={true}
          />
        )}
        <SearchInput
          label="Buscar projetos"
          placeholder="Buscar projetos..."
          name={LISTING_PARAM_KEYS.busca}
        />
      </form>
    </section>
  )
}

/** The grid, the empty body or the error body — exactly one of the three (FR-017, FR-018). */
function resultado(
  listagem: { docs: ProjetoDoc[]; page: number; totalPages: number } | null,
  params: ListingParams,
): ReactNode {
  if (listagem === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar os projetos."
        // The URL that just failed, filter included: a retry that quietly drops the filter
        // reports success for a different page than the one that broke.
        acao={{ label: 'Tentar novamente', href: listingHref(PROJETOS_PATH, { ...params, page: 1 }) }}
      />
    )
  }

  if (listagem.docs.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhum projeto encontrado."
        descricao="Tente outra categoria ou limpe a busca."
        acao={{ label: 'Limpar filtros', href: PROJETOS_PATH }}
      />
    )
  }

  return (
    <>
      <ListingGrid label="Projetos">
        {listagem.docs.map((projeto, posicao) => cardDe(projeto, posicao))}
      </ListingGrid>
      {/* The shared control (T010), not a second copy of the window: this page is the template
          the other four listings are cut from, and a bar defined here is one they would each
          have to reproduce. `hrefFor` is the whole of the URL contract — every page is a link
          `listingHref` builds, so the filter and the search term ride along and the control
          itself never learns what a listing URL looks like. */}
      <Pagination
        page={listagem.page}
        totalPages={listagem.totalPages}
        hrefFor={(n) => listingHref(PROJETOS_PATH, { ...params, page: n })}
      />
    </>
  )
}

/** Next hands a page its query string as a promise. */
type ProjetosPageProps = { readonly searchParams: Promise<RawListingParams> }

/**
 * `/projetos` — the listing every other public listing is copied from.
 *
 * @example /projetos?categoria=corte-a-laser&busca=cadeira&pagina=2
 */
export default async function Page({ searchParams }: ProjetosPageProps): Promise<ReactElement> {
  const raw = await searchParams

  // The vocabulary first, because the parser needs it: "which categories exist" is what turns a
  // stranger's query string into state, and it is per organization (US2).
  const categorias = await lerOuFalhar<CategoriaDoc[]>(lerCategorias, [])
  const params = parseListingParams(raw, { knownCategories: slugsDe(categorias) })

  // `null` is "this read failed", which is a different page from "this filter matched nothing".
  const listagem = await lerOuFalhar<{
    docs: ProjetoDoc[]
    page: number
    totalPages: number
  } | null>(() => listPublic<ProjetoDoc>({ collection: 'projeto', params }), null)

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
    // The ring must follow the BAND, not only the page: the accent on this teal scores 1.13:1
    // against WCAG 1.4.11's 3:1, so the ring on every target inside the band was invisible.
    // Navy on teal is 7.18:1 and is the documented pair.
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
    // Three lines in the mockup; measured in characters so it holds at every breakpoint.
    maxWidth: '46ch',
  },
  filtros: {
    display: 'flex',
    // Wraps rather than scrolling as a whole: below the tablet target the bar becomes the tabs
    // on one row (they scroll on their own, `TABS_STYLE`) and the full-width field beneath,
    // which is what § Adaptação mobile asks for.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-6) var(--space-5)',
  },
  busca: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  conteudo: { padding: '0 var(--space-5) var(--space-10)' },
}
