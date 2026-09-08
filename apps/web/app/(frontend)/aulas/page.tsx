import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { EmptyState, formatHandle, Pagination, SearchInput } from '@fablab/ui'

import { listPublic, PAGE_SIZE } from '../../../lib/public/listing'
import {
  LISTING_PARAM_KEYS,
  listingHref,
  parseListingParams,
  type ListingParams,
  type RawListingParams,
} from '../../../lib/public/params'
import { TenantUnresolvedError } from '../../../lib/tenancy/errors'

/**
 * T022 / FR-006, FR-013, FR-028, US4 — the Aulas catalogue.
 *
 * `spec.md` FR-006: *"Aulas: light background, navy text, numbered two-column list, duration
 * and `ASSISTIR`"*; FR-013: *"Classes play without an account; no progress, badge or resume is
 * shown to a visitor"*. `aulas.md` fixes the bands: the **teal hero** (*"Título display navy:
 * `AULAS`"* plus the three-line invitation), the **section bar** (`TODAS AS AULAS` and *"campo
 * de busca arredondado … placeholder `Buscar aulas...`"*), the **numbered two-column list**
 * (*"01–04 na coluna esquerda, 05–08 na direita"*, one column below desktop) and the card,
 * whose right-hand action is `ASSISTIR`.
 *
 * ── The four decisions this page makes that the Projetos template does not ──────────────────
 *
 * 1. **It is a light page** (FR-006, FR-028, decided 2026-08-23). It re-declares the surface
 *    *role* rather than painting a colour — see {@link ESTILO.pagina_} — so the cards, the
 *    search field and the pagination follow the region into the light treatment. The teal band
 *    stays: *"a faixa teal permanece"* (round 2), which is exactly why `--surface-band` does
 *    not derive from `--surface-page` in the token layer.
 * 2. **There are no tabs.** `aula` declares no `categoria` at all — `listing.ts`'s shape map
 *    says so and gives the reason — so this page reads no vocabulary and issues no `find` of
 *    its own; the search field is the whole filter bar. *"Não há tabs/filtros de categoria
 *    neste mockup"* agrees, and the tag filters round 2 sketched have no UI yet.
 * 3. **`ASSISTIR` is a link to the video, and nothing stands between.** *"`ASSISTIR` não pede
 *    login — o botão reproduz o vídeo também para o visitante"* (PO, 2026-08-24). A link is
 *    what makes that literally true: no modal, no client boundary, no account check to get
 *    wrong. CLR-001 leaves `aula` list-only, so the video URL is the destination the card has.
 * 4. **Nothing personal is rendered.** No progress bar, no completion badge, no resume
 *    position, no XP — US4's edge case says their absence *is* the correct rendering for a
 *    visitor, and feature 004 is what brings the signed-in half. `progressoAula` exists only
 *    for a signed-in maker (PO, 2026-08-24), so a listing that rendered any of it would be
 *    rendering a row that cannot exist on this path.
 *
 * A server component, like every listing (plan § "Implementation approach"): the search is a
 * GET form, the pagination and `ASSISTIR` are anchors. The page ships no JavaScript of its own
 * (FR-024).
 */

export const metadata = { title: 'AULAS — Fab Lab CITe Bauru' }

/** This listing's own path. Every link on the page is built from it, so the route moves in one
 *  edit and no href is left pointing at the old one. */
export const AULAS_PATH = '/aulas'

/**
 * `aula` has no category vocabulary — the parser still needs the argument, so the emptiness is
 * named rather than written as a bare `[]` at the call site.
 *
 * With no known slugs, any `?categoria=` a stranger types narrows to `TODOS`, which is the
 * whole of US2's error case on a collection that has no categories to confuse.
 */
const SEM_CATEGORIAS: readonly string[] = []

/** One media document as `depth: 1` populates it. `sizes.card` is the derivative
 *  `midiaImagem` generates for exactly this list. */
type MidiaDoc = {
  readonly url?: string | null
  readonly sizes?: { readonly card?: { readonly url?: string | null } }
}

/** The author profile as `depth: 1` populates it. */
type PerfilDoc = { readonly nome?: string; readonly handle?: string }

/**
 * One class as the listing reader returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 *
 * `progressoAula`'s fields are deliberately absent from this type. They are not this page's to
 * render (FR-013), and a field that has no name here cannot be printed by accident.
 */
type AulaDoc = {
  readonly titulo?: string
  readonly slug?: string
  readonly descricao?: string
  readonly thumbnail?: MidiaDoc | number | null
  readonly videoUrl?: string | null
  readonly duracaoMin?: number
  readonly autor?: PerfilDoc | number | null
  readonly curtidas?: number
}

/** A populated relationship, or `null` when it arrived as a bare id. */
const asDoc = <T,>(value: T | number | string | null | undefined): T | null =>
  typeof value === 'object' && value !== null ? value : null

/** The widest row this list draws — two columns, and only at desktop (see {@link AULAS_CSS}). */
const COLUNAS = 2

/**
 * Run the public read, and answer the two failures a visitor can actually meet.
 *
 * An **unresolved host** is 404 for the whole site, the same answer `layout.tsx` gives: serving
 * one organization's page on another's hostname is the failure feature 000's US4 forbids, and
 * it is worse than an error because nobody would notice it. Anything else is an outage of this
 * one read, and FR-018 says the page reports it in place with a retry — the hero and the search
 * field stay usable, so the visitor can reach a term that works.
 */
async function lerOuFalhar<T>(ler: () => Promise<T>, aoFalhar: T): Promise<T> {
  try {
    return await ler()
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split `currentOrganization()` makes.
    console.warn('[aulas] a public read failed; rendering the error state.', erro)
    return aoFalhar
  }
}

/**
 * `01`, `02`, … — two digits, so the outlined box never changes width between 9 and 10, and
 * **continuous across pages**: `13` is the first card of page 2, not a second `01`.
 *
 * The catalogue is drawn as one numbered trail (`aulas.md` § Lista de aulas), so a number that
 * restarted every twelve rows would put the same label on two different classes and tell a
 * visitor nothing about where in the trail they are. The offset is `PAGE_SIZE`'s, imported from
 * the reader that decides it — retyping `12` here is how the two drift apart on the day
 * CLR-003 is revisited.
 */
const numeroDe = (pagina: number, posicao: number): string =>
  String((pagina - 1) * PAGE_SIZE + posicao + 1).padStart(2, '0')

/** The thumbnail URL: the generated card derivative, or the original when none was made. */
function thumbSrc(imagem: AulaDoc['thumbnail']): string {
  const doc = asDoc<MidiaDoc>(imagem)
  return doc?.sizes?.card?.url ?? doc?.url ?? ''
}

/**
 * The author strip: the person's name and `@nomesobrenome` (round 4, 2026-08-24).
 *
 * No level. `aulas.md` draws `NÍVEL n` beside the handle, and the same file records that those
 * numbers are illustrative; `perfilMaker` carries no `nivel` until feature 005, so the only
 * options were a number nobody earned on a public page or its absence. `formatHandle` prints
 * the `@`, in the one place that decides how.
 */
function autoriaDe(autor: AulaDoc['autor']): ReactNode {
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
 * The watch action, or the error state for a class whose video source is missing.
 *
 * US4's error case: *"a class whose video source is missing shows the error state for that card
 * and does not break the rest of the list"*. `videoUrl` is required on the collection, so an
 * empty one is a broken row rather than an optional field — and a button linking to `""` is
 * worse than no button, because it reloads the catalogue and reads as the video having failed
 * to play. The message is per card; nothing here can take a neighbour down.
 *
 * The href is the video itself (PO, 2026-08-24: *"`ASSISTIR` não pede login"*). `target`/`rel`
 * because the source is a third-party embed on another origin — `noreferrer` keeps the visitor's
 * page out of the video host's referrer log, which is the closest this page gets to a privacy
 * decision.
 */
function assistirDe(aula: AulaDoc): ReactNode {
  const titulo = aula.titulo ?? ''
  const video = aula.videoUrl ?? ''
  if (video === '') return <span style={ESTILO.indisponivel}>Vídeo indisponível.</span>
  return (
    <a
      href={video}
      // The label is `ASSISTIR` on every card, so the accessible name has to say which class —
      // a list of eight identical "ASSISTIR" links is unnavigable by voice or by link list.
      aria-label={`Assistir ${titulo}`}
      target="_blank"
      rel="noopener noreferrer"
      style={ESTILO.assistir}
    >
      ASSISTIR
    </a>
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
function cardDe(aula: AulaDoc, posicao: number, pagina: number): ReactElement {
  return (
    <li key={aula.slug ?? posicao} className={CLASSE.card}>
      <span style={ESTILO.numero}>{numeroDe(pagina, posicao)}</span>
      <span style={ESTILO.thumb}>
        <img
          src={thumbSrc(aula.thumbnail)}
          // `midiaImagem` stores no alt text and the title sits beside the thumbnail: an alt
          // built from the title makes a screen reader read the same words twice.
          alt=""
          loading={posicao < COLUNAS ? 'eager' : 'lazy'}
          decoding="async"
          style={ESTILO.thumbImg}
        />
      </span>
      <span style={ESTILO.corpo}>
        <span style={ESTILO.titulo}>{aula.titulo ?? ''}</span>
        <span style={ESTILO.descricao}>{aula.descricao ?? ''}</span>
        <span style={ESTILO.meta}>
          {autoriaDe(aula.autor)}
          {/* "ícone de relógio outline + duração: 25 min". One string, not two spans: a screen
              reader reading "25" and "min" as separate items is not a duration. */}
          <span>{`${String(aula.duracaoMin ?? 0)} min`}</span>
          {/* FR-015: the count is shown to everyone, as text. The clicking half is `LikeButton`,
              one of the six islands — a card that rendered it would ship twelve client
              boundaries on this page alone, which is the failure FR-024 exists to prevent. */}
          <span>
            <span aria-hidden={true}>♥</span> {aula.curtidas ?? 0}
          </span>
        </span>
      </span>
      <span style={ESTILO.acoes}>{assistirDe(aula)}</span>
    </li>
  )
}

/**
 * The hero band (`aulas.md` § Hero).
 *
 * `--surface-band` and not `--surface-page`: *"a faixa teal permanece"* on this page (round 2,
 * 2026-08-23), so the band is the one surface that must not follow the white content area
 * beneath it. The ink is `--text-on-light`, because navy on teal is the documented pair.
 *
 * The isometric composition the mockup draws to the right is deliberately absent: it is art
 * that does not exist as an asset yet, and an empty box holding its place would be worse than
 * the band without it.
 */
function hero(): ReactElement {
  return (
    <section style={ESTILO.hero}>
      <h1 style={ESTILO.heroTitulo}>AULAS</h1>
      <p style={ESTILO.heroTexto}>
        Aprenda com tutoriais práticos e conteúdos feitos para makers de todos os níveis.
      </p>
    </section>
  )
}

/**
 * The section bar: the title on the left, the search field on the right.
 *
 * The search is a plain GET form, so the term lands in the URL and the result is linkable and
 * reloadable (FR-010) with no JavaScript at all. There is no hidden category input here and
 * there must not be one: `aula` has no categories, so a `?categoria=` in this form's submission
 * would be a parameter the reader is documented to ignore.
 */
function barra(): ReactElement {
  return (
    <section style={ESTILO.barra}>
      <h2 style={ESTILO.barraTitulo}>TODAS AS AULAS</h2>
      <form method="get" action={AULAS_PATH} style={ESTILO.busca}>
        <SearchInput
          surface="light"
          label="Buscar aulas"
          placeholder="Buscar aulas..."
          name={LISTING_PARAM_KEYS.busca}
          // The field sits on the white content area, not on the navy base: the surface decides
          // both the fill and the ink, and the default would be claro-on-navy over white.
          />
      </form>
    </section>
  )
}

/** The list, the empty body or the error body — exactly one of the three (FR-017, FR-018). */
function resultado(
  listagem: { docs: AulaDoc[]; page: number; totalPages: number } | null,
  params: ListingParams,
): ReactNode {
  if (listagem === null) {
    return (
      <EmptyState
        surface="light"
        variant="erro"
        titulo="Não foi possível carregar as aulas."
        // The URL that just failed, term included: a retry that quietly drops the search
        // reports success for a different page than the one that broke.
        acao={{ label: 'Tentar novamente', href: listingHref(AULAS_PATH, { ...params, page: 1 }) }}
      />
    )
  }

  if (listagem.docs.length === 0) {
    return (
      <EmptyState
        surface="light"
        variant="vazio"
        titulo="Nenhuma aula encontrada."
        descricao="Tente outro termo ou limpe a busca."
        // `LIMPAR BUSCA`, not `LIMPAR FILTROS` (`aulas.md` names the page's primary buttons):
        // there are no filters on this listing, only the term.
        acao={{ label: 'Limpar busca', href: AULAS_PATH }}
      />
    )
  }

  return (
    <>
      <ol
        className={CLASSE.lista}
        aria-label="Aulas"
        // The column flow needs the row count, which only the page knows. Without it the two
        // columns fill across the row (`01 02` side by side) and the drawn order stops matching
        // the numbers: "01–04 na coluna esquerda, 05–08 na direita".
        style={{ '--fl-aulas-linhas': Math.ceil(listagem.docs.length / COLUNAS) } as CSSProperties}
      >
        {listagem.docs.map((aula, posicao) => cardDe(aula, posicao, listagem.page))}
      </ol>
      {/* Outside the <ol>, not inside it: a list may contain only <li>, and React 19 hoists a
          precedence-carrying <style> into <head> from wherever it sits. */}
      <style href="fablab-aulas" precedence="default">
        {AULAS_CSS}
      </style>
      {/* The shared control (T010), never a second copy of the window: `hrefFor` is the whole
          of the URL contract, so the search term rides along and the control itself never
          learns what a listing URL looks like. */}
      <Pagination
        surface="light"
        page={listagem.page}
        totalPages={listagem.totalPages}
        hrefFor={(n) => listingHref(AULAS_PATH, { ...params, page: n })}
      />
    </>
  )
}

/** Next hands a page its query string as a promise. */
type AulasPageProps = { readonly searchParams: Promise<RawListingParams> }

/**
 * `/aulas` — the video catalogue, watchable without an account.
 *
 * @example /aulas?busca=laser&pagina=2
 */
export default async function Page({ searchParams }: AulasPageProps): Promise<ReactElement> {
  const raw = await searchParams
  const params = parseListingParams(raw, { knownCategories: SEM_CATEGORIAS })

  // `null` is "this read failed", which is a different page from "this search matched nothing".
  const listagem = await lerOuFalhar<{
    docs: AulaDoc[]
    page: number
    totalPages: number
  } | null>(() => listPublic<AulaDoc>({ collection: 'aula', params }), null)

  return (
    <main style={ESTILO.pagina_}>
      {hero()}
      {barra()}
      <section style={ESTILO.conteudo}>{resultado(listagem, params)}</section>
    </main>
  )
}

/** The class names, in one place: the markup and `AULAS_CSS` must agree, and a typo in either
 *  is an unstyled element or a breakpoint that switches nothing. */
const CLASSE = {
  lista: 'fl-aulas',
  card: 'fl-aula',
} as const

/**
 * Everything that needs a breakpoint, as a stylesheet — the rest is style objects below.
 *
 * The split is the one every component in `packages/ui` makes: a media query cannot live in a
 * style object, and a class name is assertable only as text in two files. So the responsive
 * decisions are here, where the emitted CSS is what the suite reads, and the colour and spacing
 * decisions are data. Mobile first, at the design targets feature 001 froze — and only 1440
 * appears, because this list has one breakpoint: *"lista numerada em 2 colunas"* at desktop,
 * *"2 → 1 coluna"* at tablet, one at mobile.
 */
export const AULAS_CSS = `
.${CLASSE.lista} {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}
.${CLASSE.card} {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4);
  /* Round 2, 2026-08-23: white card, dark navy outline and the hard offset shadow. The fill is
     the page's own surface, which this page re-declared to white — so the card follows the
     region rather than naming a colour of its own. */
  background: var(--surface-card);
  border: 1px solid var(--text-on-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-hard);
  min-width: 0;
}
@media (min-width: 1440px) {
  .${CLASSE.lista} {
    grid-template-columns: repeat(${String(COLUNAS)}, minmax(0, 1fr));
    /* The numbering runs DOWN each column, not across the row: "01–04 na coluna esquerda,
       05–08 na direita". Column flow is what makes the DOM order and the drawn order agree,
       so the numbers a visitor reads are the numbers the markup carries. */
    grid-auto-flow: column;
    grid-template-rows: repeat(var(--fl-aulas-linhas, 1), auto);
  }
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
    '--surface-page': 'var(--surface-inverted)',
    '--surface-card': 'var(--surface-inverted)',
    // T028 / FR-023: the ring follows the region, exactly as the two surfaces above do. The
    // `:root` default is the accent, which scores 2.05:1 on this white content area — a ring
    // nobody can see. Navy scores 16.63:1 here and is the ink this page already writes in.
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-page)',
    color: 'var(--text-on-light)',
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  hero: {
    background: 'var(--surface-band)',
    // The ring must follow the BAND, not only the page. `--focus-ring-color` resolves from
    // `:root` (or the page's own override) to the accent, and the accent on this teal scores
    // **1.13:1** — WCAG 1.4.11 asks 3:1 for a focus indicator, so the ring on every target
    // inside this band was invisible while the page-level override two rules away made the
    // rest of the page correct. Navy on teal is 7.18:1 and is the documented pair.
    '--focus-ring-color': 'var(--text-on-light)',
    // Navy on teal is the documented pair; the light-on-dark default would be unreadable here.
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
  barra: {
    display: 'flex',
    // Wraps rather than scrolling: below the tablet target the bar becomes the title on one row
    // and the field beneath it, which is what § Adaptação mobile asks for.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-6) var(--space-5)',
  },
  barraTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    textTransform: 'uppercase',
    // "sobre o fundo branco da página, o título vai em navy" (2026-08-23).
    color: 'var(--text-on-light)',
  },
  busca: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  conteudo: { padding: '0 var(--space-5) var(--space-10)' },
  numero: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    // Navy, not the mockup's pink — on white this is small text, and FR-028 forbids pink for
    // it. The outline is navy for the same reason the shared `SearchInput` inks its light
    // surface navy: the accent at 1px on white sits below the 3:1 that a component boundary
    // owes WCAG, and this page is the one that had to resolve that.
    color: 'var(--text-on-light)',
    border: '1px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-2)',
    lineHeight: 1,
  },
  thumb: {
    // "thumbnail ilustrada (~5:3)" — the ratio is the box's, so a thumbnail that was generated
    // at another aspect is cropped rather than reflowing the row.
    background: 'var(--color-navy)',
    // A navy island on a light page. The page re-declares `--focus-ring-color` to navy for its
    // white surface, so a target in here would ring navy on navy — 1.00:1. The accent is
    // 8.12:1 on navy and is what `:root` uses for exactly this surface, so the island hands
    // the ring back rather than inventing a third colour.
    '--focus-ring-color': 'var(--color-primary)',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    flex: '0 0 auto',
    width: '120px',
    height: '72px',
    display: 'block',
  } as CSSProperties,
  thumbImg: { display: 'block', width: '100%', height: '100%', objectFit: 'cover' },
  corpo: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0, flex: 1 },
  titulo: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    textTransform: 'uppercase',
    // "sobre o card branco o título vai em azul navy escuro, não em rosa" (round 2).
    color: 'var(--text-on-light)',
  },
  descricao: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
  },
  autor: { display: 'flex', gap: 'var(--space-2)' },
  handle: { opacity: 0.8 },
  acoes: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  assistir: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    // FR-022: the compact breakpoints owe every target 44×44, and this is the one a visitor
    // came for.
    minHeight: '44px',
    minWidth: '44px',
    padding: '0 var(--space-4)',
    // "retângulo outline teal" — the frame is teal, the label navy (FR-028).
    border: '1px solid var(--color-teal)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-on-light)',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  indisponivel: {
    // The per-card error state (US4). Navy on white like everything else here: a red would be
    // an eighth colour, and the identity is fixed at seven.
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
    maxWidth: '12ch',
  },
}
