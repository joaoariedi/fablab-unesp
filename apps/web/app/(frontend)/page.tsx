import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * T025, T026 / FR-009, FR-011, FR-024, SC-006, CLR-004 — Home v1.
 *
 * `home.md` § *Hero — v2 (mapa pixel art em tela cheia)* fixes the art: *"Cena isométrica
 * noturna do lab ocupando a viewport inteira; texto sobreposto à esquerda"*, with `CRIE.` /
 * `EXPERIMENTE.` in white and `TRANSFORME.` in the accent. `plan.md` § Sketch 8 fixes the
 * delivery: AVIF with a WebP fallback, preloaded, never lazy, `image-rendering: pixelated`.
 *
 * T026 completed the page around it: the hero's `COMECE A CRIAR` call to action, the
 * `ÚLTIMOS PROJETOS` carousel, and the footer — which arrives from `layout.tsx`, on every page,
 * and is deliberately *not* rendered a second time here.
 *
 * ── The three gamified panels, and why they are here now (CLR-004 is satisfied) ──────────────
 *
 * `home.md` describes `MISSÕES EM DESTAQUE`, `NÍVEL DO LAB` and `RANKING MAKERS` in as much
 * detail as it describes the carousel, and until feature 006 this page drew none of them. That
 * was CLR-004, and it was a decision rather than an omission: every panel reads a table feature
 * 005 had not created yet, and none of them would have failed loudly — they would have rendered
 * a lab at level 0, an empty ranking and three missions at 0%, which looks like a product
 * nobody uses rather than a section not shipped yet.
 *
 * **005 created them** — `missao` (now carrying the `destaqueHome` curation flag), `xpLedger`
 * with `regrasXp`, and `perfilMaker` — so the condition CLR-004 named has been met and the
 * three sections are rendered below: {@link missoesEmDestaque}, {@link nivelDoLabSecao} and
 * {@link rankingMakers}, each reading through the doors this file's readers name and each
 * drawing its own heading for all three outcomes, so a failed block never reads as a product
 * that has no missions (FR-022).
 *
 * `tests/public/home.test.ts` § 3 was inverted in the same change (FR-027): the section that
 * asserted the panels were absent now asserts they are present and that the lab card mounts the
 * real `ProgressBar`. It landed *with* the panels and not after them — a § 3 left standing
 * behind them is a red the run can only read as a regression.
 *
 * What the Home still does **not** draw is skills: no `SkillPips` belongs in any of the three,
 * and § 3 keeps that half of the old assertion at zero.
 *
 * ── The hero IS the LCP element, so every attribute below is a budget decision ───────────────
 *
 * SC-006 puts LCP at 2.5s on `scripts/lcp-budget.sh`'s 1638 kbps profile (~205 KB/s), and this
 * is the largest asset in the product. So:
 *
 *   * **`<picture>` with AVIF first.** 143 KB against the WebP's 182 KB at the same width and
 *     the same visible quality — 39 KB, ~0.2s of the budget, for one extra export.
 *   * **A `<link rel="preload" as="image">` carrying `imageSrcSet`/`imageSizes`.** Without the
 *     responsive pair the hint warms *one* width and the element then downloads another: the
 *     hero paid for twice. It names the AVIF type so the browsers that will use the WebP do not
 *     fetch bytes they cannot decode and the ones that will not use it do not fetch it twice.
 *     This is the technique `layout.tsx` already spends on the display face.
 *   * **Never `loading="lazy"`, always `fetchPriority="high"`.** Deferring the one image the
 *     metric measures is the most effective single way to fail SC-006.
 *   * **`imageRendering: 'pixelated'`.** The art is 1106px wide and a desktop viewport is
 *     wider, so the browser upscales it; the default bilinear filter turns single-pixel pink
 *     and teal edges into mush. `PIXEL_IMAGE_STYLE` is the same declaration `PixelImage`
 *     (packages/ui) sets for sprites — reused rather than restated so there is one spelling of
 *     this decision in the codebase.
 *
 * ── The art, and what was cropped out of it ──────────────────────────────────────────────────
 *
 * Source: `docs/product/design/home-desktop.png`, the designer's delivered v2 art (2026-08-26,
 * with the canonical orange chip). It is a full mockup, not an asset: the header band and the
 * headline column are *drawn into it*. Both are HTML here — `HeaderNav` renders the first and
 * {@link textoDoHero} the second — so the derivatives are cropped to the scene alone
 * (`extract({ left: 430, top: 104, width: 1106, height: 920 })`), which is also the *"recorte
 * no centro de interesse (contêineres)"* `home.md` § *Adaptação tablet* already sanctions. The
 * cost is recorded rather than hidden: the `IMPRESSORAS 3D` container is clipped at the left
 * edge, because in the delivered art it sits *behind* the drawn headline.
 *
 * `home.md` also names a dedicated mobile composition (`design/home-mobile.png`, text *below*
 * the scene). That is art direction — a second aspect ratio, a `<source media>` — and it
 * belongs with the layout in T026, not with this file's format and byte work.
 */

import { notFound } from 'next/navigation'

import {
  CARD_TITLE_STYLE,
  CardProjeto,
  type CardProjetoAutor,
  EmptyState,
  LikeButton,
  LOGIN_HREF,
  PIXEL_IMAGE_STYLE,
  PRIMARY_BUTTON_STYLE,
  PixelImage,
  ProgressBar,
  ProjectCarousel,
  cardStyle,
  formatHandle,
} from '@fablab/ui'

import {
  ETAPAS_DA_MISSAO,
  ETAPAS_POR_ESTADO,
  type EstadoPessoal,
  estadoDe,
} from '../../lib/content/missoes'
import { type NivelDoLab, nivelDoLab } from '../../lib/content/xp'
import { listPublic } from '../../lib/public/listing'
import { estadoPessoal } from '../../lib/public/missoes'
import { ALL_CATEGORIES } from '../../lib/public/params'
import { getTenantScopedPayloadForRSC } from '../../lib/tenancy'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'
import {
  getPublicScopedPayloadForRSC,
  type RankingRow,
  readPublicRanking,
} from '../../lib/tenancy/public-payload'
// The board's own route, taken from the page that serves it (FR-020) — the same reason
// `public-payload.ts` imports `ORDENACAO_DO_RANKING` from there rather than retyping it. A
// constant, so no component is evaluated by the import.
import { RANKING_PATH } from '../../lib/content/ranking'

/**
 * The hero derivatives, as `srcSet` strings.
 *
 * The `w` descriptor is what the browser selects on, so it is each file's REAL intrinsic width
 * and the filename says the same number. Sketch 8 sketched `mapa-1440`; the delivered art is
 * 1106px wide once the drawn headline column is cropped away, and a file called `1440` would
 * make the descriptor beside it a lie the selection algorithm believes.
 */
const HERO_AVIF_SRCSET = '/hero/mapa-1106.avif 1106w, /hero/mapa-834.avif 834w'
const HERO_WEBP_SRCSET = '/hero/mapa-1106.webp 1106w, /hero/mapa-834.webp 834w'

/**
 * The dedicated mobile art (`home.md` § *Adaptação mobile* — **Hero v2, oficial**).
 *
 * `design/home-mobile.png` was delivered on 2026-08-24 and the same entry strikes out the
 * alternative this page shipped without it: *"~~substituir o mapa panorâmico por recorte
 * vertical (crop 3:4)~~ **Decidido (2026-08-23): superado pela arte mobile dedicada**"*. The
 * panoramic crop under an overlaid text panel is exactly the superseded option, and it was what
 * a 390px visitor got.
 *
 * ── What is cropped, and why there ──────────────────────────────────────────────────────────
 *
 * `top: 110` drops the header bar the mockup draws — `HeaderNav` renders that, and baking a
 * second one into the art would show two. `height: 1280` stops just above the fence sign, which
 * shares its band with the drawn headline: a crop below it would bake `CRIE.` /
 * `EXPERIMENTE.` / `TRANSFORME.` into the image while {@link textoDoHero} also says them, so a
 * sighted visitor would read the three words twice and a screen reader once.
 *
 * ── One candidate, not a ladder, and that is a measured decision ────────────────────────────
 *
 * T027 measured the Home at **3360 ms against the 2500 ms budget**, and named the arithmetic:
 * the LCP element is this image, and it shares a 188,743 B/s link with ~229 KB of script and
 * font bytes, so what is left for the hero is roughly 40 KB. A `srcSet` ladder would defeat
 * that — Lighthouse's mobile profile is 412 CSS px at DPR 1.75, so a browser offered a 864w
 * file picks it (126,335 B) and the budget is lost to a sharpness nobody asked for.
 *
 * 432w at 37,527 B is the candidate that fits, and it is upscaled with `image-rendering:
 * pixelated` (`PIXEL_IMAGE_STYLE`). For pixel art that is not a compromise but the medium's own
 * display mode — the same argument `PixelImage` and SC-008's integer-scale clamp already make
 * for every sprite in the product.
 */
const HERO_MOBILE_AVIF = '/hero/cena-mobile-432.avif'
const HERO_MOBILE_WEBP = '/hero/cena-mobile-432.webp'

/** The width below which the dedicated mobile composition is the one drawn. `--bp-tablet` is
 *  834, so this is "narrower than a tablet" — the same boundary the shell switches its
 *  navigation at, kept as one number rather than two that can drift apart. */
const HERO_MOBILE_MEDIA = '(max-width: 833px)'

/** The desktop art's own condition, so the two `<source>` elements and the two preload hints
 *  partition every viewport exactly once. Without it both preloads fire and the narrow visitor
 *  pays for the panorama they will never see — which is worse than not preloading at all. */
const HERO_WIDE_MEDIA = '(min-width: 834px)'

/** The mobile scene's intrinsic size, for the same box-reservation reason as {@link HERO_ART}. */
const HERO_MOBILE_ART = { width: 432, height: 640 } as const

/** The single file a browser with neither `<source>` gets. WebP, because it is the format
 *  every target browser decodes — an AVIF here would make the first source decorative and
 *  break exactly the browsers the fallback exists for. */
const HERO_FALLBACK_SRC = '/hero/mapa-1106.webp'

/**
 * The hero's two compositions, as a stylesheet.
 *
 * A style object cannot answer a media query, and the two compositions are not a value apart —
 * they are different layouts. `home.md` decides the narrow one explicitly:
 *
 *   *"**Bloco de texto ABAIXO da cena** (sobre fundo navy escuro), **não sobreposto**"*, with
 *   the CTA *"em **largura parcial** (~38% da largura da arte: 325 de 864px)"*.
 *
 * Wide keeps the overlay the desktop art was drawn for — its headline column is empty on
 * purpose. Narrow stacks: scene, then text on the page surface. The panel behind the text is a
 * wide-only concern for the same reason it exists at all — below the scene there are no lit
 * windows to read over.
 *
 * Mobile-first, so the narrow rules need no query and the query adds the desktop overlay. A
 * `min-width` query is one condition to get right; a `max-width` one plus a default is two that
 * can disagree at the boundary.
 */
const HOME_HERO_CSS = `
.fl-home-hero {
  display: flex;
  flex-direction: column;
  background: var(--surface-page);
}
.fl-home-hero__arte {
  width: 100%;
  height: auto;
  display: block;
  /* The mobile art's own ratio, and it has to be stated here.
     The width/height attributes on the image reserve the box before a byte arrives — but they carry the
     WIDE art's 1106x920 (1.20), while this branch paints a 432x640 scene (0.675). Left to the
     attributes the browser reserves a landscape box, then reflows the whole page taller when
     the portrait image decodes: a layout shift on the one page SC-006 measures, and one that
     can re-elect the LCP candidate mid-load. An attribute cannot answer a media query, so the
     override belongs to the same rule the composition does. */
  aspect-ratio: ${HERO_MOBILE_ART.width} / ${HERO_MOBILE_ART.height};
}
.fl-home-hero__texto {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-5) var(--space-8);
  color: var(--text-on-dark);
}
.fl-home-hero__cta {
  /* "largura parcial (~38% da largura da arte: 325 de 864px)" — a floor of 44px for FR-022 and
     a ceiling so the button does not stretch to the full width the decision supersedes. */
  align-self: flex-start;
  min-width: min(38%, 20rem);
  text-align: center;
}
@media (min-width: 834px) {
  .fl-home-hero {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    height: min(78vh, 920px);
    overflow: hidden;
  }
  .fl-home-hero__arte {
    position: absolute;
    inset: 0;
    height: 100%;
    /* Back to the section's box: above 834 the art is an absolutely-positioned cover layer, so
       a portrait ratio here would fight object-fit for the height instead of filling it. */
    aspect-ratio: auto;
    /* The section is wider than the art is tall here, so the crop is vertical; \`center\` keeps
       the containers — the labelled stations the scene is about — in frame. */
    object-fit: cover;
    object-position: center;
  }
  .fl-home-hero__texto {
    position: relative;
    margin: var(--space-8) var(--space-5);
    padding: var(--space-6);
    max-width: 34ch;
    border-radius: var(--radius-md);
    /* 72%, not the mockup's 60%: measured against this crop, 60% left the paragraph sitting on
       a lit container wall. It writes no colour — it dilutes the page surface with transparency. */
    background: color-mix(in srgb, var(--surface-page) 72%, transparent);
  }
  .fl-home-hero__cta {
    min-width: 0;
  }
}
`

/** The class names the stylesheet above declares, in one place so a rename cannot half-happen. */
const CLASSE = {
  hero: 'fl-home-hero',
  arte: 'fl-home-hero__arte',
  texto: 'fl-home-hero__texto',
  cta: 'fl-home-hero__cta',
} as const

/** Full-bleed at every breakpoint. Stated rather than left to default so the preload scanner
 *  picks the same candidate the element will, before layout has happened. */
const HERO_SIZES = '100vw'

/** The art's intrinsic size, so the browser reserves the box before a byte arrives. Without it
 *  the hero is 0px tall until it decodes, everything below jumps, and the LCP candidate can be
 *  re-elected mid-load. */
const HERO_ART = { width: 1106, height: 920 } as const

/**
 * The preload hint for the hero (`plan.md` § Sketch 8).
 *
 * React 19 hoists a `<link>` into `<head>` and de-duplicates it, so it is written where it is
 * *about* rather than in `layout.tsx` — which would spend the hint on all six pages, five of
 * which have no hero and would pay for a download none of them renders.
 */
function preloadDoHero(): ReactElement {
  return (
    <>
      {/* `media` on both, and they must partition: a preload with no condition is fetched by
          every viewport, so an unconditional pair would make a 390px visitor download the
          panorama as well as the scene — 143 KB spent on an image that never paints, on the
          one page and the one profile SC-006 is measured against. */}
      <link
        rel="preload"
        as="image"
        type="image/avif"
        href={HERO_MOBILE_AVIF}
        media={HERO_MOBILE_MEDIA}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        type="image/avif"
        imageSrcSet={HERO_AVIF_SRCSET}
        imageSizes={HERO_SIZES}
        media={HERO_WIDE_MEDIA}
        fetchPriority="high"
      />
    </>
  )
}

/**
 * The scene itself.
 *
 * `alt=""` — decorative, deliberately. The headline and the paragraph beside it are real text
 * in the DOM ({@link textoDoHero}); an `alt` describing the same scene would make a screen
 * reader announce the lab twice, and an `alt` repeating the headline would announce it twice
 * in the other direction.
 */
function arteDoHero(): ReactElement {
  return (
    <picture>
      {/* Order is the selection algorithm: the first `<source>` whose `type` and `media` both
          match wins, so the mobile pair must precede the wide pair or the panorama claims
          every viewport. */}
      <source type="image/avif" srcSet={HERO_MOBILE_AVIF} media={HERO_MOBILE_MEDIA} />
      <source type="image/webp" srcSet={HERO_MOBILE_WEBP} media={HERO_MOBILE_MEDIA} />
      <source type="image/avif" srcSet={HERO_AVIF_SRCSET} sizes={HERO_SIZES} media={HERO_WIDE_MEDIA} />
      <source type="image/webp" srcSet={HERO_WEBP_SRCSET} sizes={HERO_SIZES} media={HERO_WIDE_MEDIA} />
      <img
        src={HERO_FALLBACK_SRC}
        alt=""
        // The wide art's box. The mobile branch overrides both through the stylesheet, because
        // a `width`/`height` attribute cannot answer a media query.
        width={HERO_ART.width}
        height={HERO_ART.height}
        // No `loading` at all rather than `loading="eager"`: eager IS the default, and an
        // attribute that restates a default is one more thing that can be edited to `lazy`.
        decoding="async"
        fetchPriority="high"
        className={CLASSE.arte}
        style={PIXEL_IMAGE_STYLE}
      />
    </picture>
  )
}

/**
 * The overlaid headline (`home.md` § *Hero — v2*).
 *
 * The panel behind it is the *"painel de contraste navy 60%"* the same document specifies for
 * the cropped scene: the art is a night scene, but its bright windows and lamps run right
 * through the region the text sits over, and white on those is unreadable. `color-mix` against
 * `--surface-page` rather than a literal, so it follows the page surface and writes no colour.
 */
function textoDoHero(): ReactElement {
  return (
    <div className={CLASSE.texto}>
      <h1 style={ESTILO.titulo}>
        CRIE.
        <br />
        EXPERIMENTE.
        <br />
        <span style={ESTILO.tituloAcento}>TRANSFORME.</span>
      </h1>
      <p style={ESTILO.paragrafo}>
        Bem-vindo ao Fab Lab CITe Bauru. Aqui ideias ganham forma e você evolui como maker.
      </p>
      {chamadaParaCriar()}
    </div>
  )
}

/**
 * `COMECE A CRIAR →` (`home.md` § *Hero — v2*), the page's one call to action.
 *
 * **An anchor wearing the button's identity, not a `<Button>`.** `Button` renders a
 * `<button>`, which navigates nowhere without a handler — and a handler here would make the
 * hero an island on the one page SC-006 measures, to do what an `href` does for free. The
 * identity is imported rather than restated so the CTA follows a change to the canonical
 * primary and no colour can be typed into this file (FR-027).
 *
 * **Where it goes.** `LOGIN_HREF`, the shell's own constant. Sign-up is feature 004's and does
 * not exist yet; `/login` is the account entry point that does, and taking the constant rather
 * than the literal means the day 004 lands a `/criar-conta` this CTA moves with the shell.
 */
function chamadaParaCriar(): ReactElement {
  return (
    <a href={LOGIN_HREF} className={CLASSE.cta} style={ESTILO.cta}>
      COMECE A CRIAR →
    </a>
  )
}

/** Where the full listing lives. Written once so the section heading's link and every card's
 *  destination cannot disagree about it. */
const PROJETOS_PATH = '/projetos'

/** One media document as `depth: 1` populates it. `sizes.card` is the derivative `midiaImagem`
 *  generates for exactly this card. */
type MidiaDoc = {
  readonly url?: string | null
  readonly sizes?: { readonly card?: { readonly url?: string | null } }
}

/**
 * One project as the listing reader returns it, populated one level.
 *
 * Structural rather than imported from `payload-types.ts`: that file is **gitignored**, so CI
 * type-checks without it (tasks.md § "Read before starting", item 6). A page that imported a
 * generated type would compile locally and fail the pipeline.
 */
/** The author profile as `depth: 1` populates it — `nivel` is the maker's own level, the
 *  projection of the ledger `xp.ts` maintains (FR-010). */
type PerfilDoc = { readonly nome?: string; readonly handle?: string; readonly nivel?: number }

type ProjetoDoc = {
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly categoria?: { readonly nome?: string } | number | null
  readonly imagemCapa?: MidiaDoc | number | null
  readonly autor?: PerfilDoc | number | null
  readonly curtidas?: number
}

/**
 * The author strip: the maker who made the project, or the tombstone deletion leaves behind.
 *
 * This replaces `AUTORIA_PENDENTE`, the constant that credited the lab on *every* card because
 * `projeto` carried no `autor` field at all. T039 added it — `perfilMaker`, nullable on day one
 * — and T008 gave a profile its `nivel`, so the strip finally reads a row instead of a literal
 * (FR-033, FR-034, US10). The level is the profile's own: two projects by two makers show two
 * different numbers, which the level-1 stand-in could never do.
 *
 * **An absent `autor` is an erased maker, not a missing one.** The field is nullable by design
 * and its admin description says so in as many words — *"Pode ficar vazio — um autor que pediu
 * exclusão deixa a obra sem assinatura"* — so `null` is FR-031's deletion and CLR-003's
 * tombstone is what the card owes it. Inventing a byline here is the one thing US10's error
 * case forbids: *"a project with no author is never rendered with a fabricated one"*.
 *
 * **A bare id falls in the same branch, deliberately.** It means `depth` did not populate over
 * a living maker, and the card's strip is required, so the choice is between a tombstone that
 * overstates and a lab byline that misattributes. 004 settled which is worse while writing the
 * tombstone itself (`tests/public/tombstone.test.ts` §1): *"Crediting the lab is the worse of
 * the two, because it re-attributes the work rather than merely dropping the credit."* The
 * Artigos listing keeps a lab fallback because `artigo.autor` is **required**, so an absent
 * profile there can only be a populate failure; here the two states are not that far apart, and
 * neither is worth an invented maker.
 */
function autorDe(autor: ProjetoDoc['autor']): CardProjetoAutor {
  const perfil = typeof autor === 'object' && autor !== null ? autor : null
  if (perfil === null) return { removido: true }
  return { nome: perfil.nome ?? '', handle: perfil.handle ?? '', nivel: perfil.nivel ?? 0 }
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
 * One slide.
 *
 * Every cover is `lazy`, which is the opposite of the listing's first row and deliberate: the
 * hero above is the LCP element, and a rail of eager covers below the fold competes with it for
 * exactly the bandwidth SC-006 budgets. Off-screen slides are off-screen at every breakpoint.
 */
function cardDe(projeto: ProjetoDoc, posicao: number): ReactElement {
  return (
    <CardProjeto
      key={projeto.slug ?? posicao}
      titulo={projeto.titulo ?? ''}
      descricao={projeto.descricaoCurta ?? ''}
      categoria={categoriaNome(projeto.categoria)}
      href={`${PROJETOS_PATH}/${projeto.slug ?? ''}`}
      capa={
        <img
          src={capaSrc(projeto.imagemCapa)}
          // `midiaImagem` stores no alt text and the title sits directly beneath the photo: an
          // alt built from the title makes a screen reader read the same words twice.
          alt=""
          loading="lazy"
          decoding="async"
        />
      }
      autor={autorDe(projeto.autor)}
      curtidas={projeto.curtidas ?? 0}
      // The island, on the Home's carousel too (T003, FR-025, US7). US7 says *"on any card
      // that shows a heart"*, and these cards show one: a heart that answers a press on
      // /projetos and does nothing here is the half-shipped state CLR-010 moved to 004, just
      // relocated rather than closed. `curtidas` above is still passed — it is the static
      // count the card falls back to, and `CardProjeto` requires it.
      //
      // The LCP cost is deliberate and measured, not assumed: this is the page SC-006 budgets
      // and `scripts/lcp-budget.sh` runs `/` first. Three cards, three boundaries, one shared
      // chunk — and if that ever stops fitting the budget, the gate says so in numbers.
      curtir={<LikeButton curtidas={projeto.curtidas ?? 0} />}
    />
  )
}

/**
 * The latest published projects, through the one listing reader (FR-002, FR-011).
 *
 * `null` is *"this read failed"*, which is a different page from *"this lab has published
 * nothing yet"* — and both are different from an unresolved host, which is a 404 for the whole
 * site exactly as `layout.tsx` and every listing answer it. Collapsing the three is how a
 * broken query ends up rendering as an empty product.
 *
 * The parameters are the default state spelled out: no category, no search, page 1. `listPublic`
 * owns the ordering (`-dataPublicacao`), the published-only filter, the tenant and the page
 * size, none of which this page is allowed to have an opinion about (plan § Sketch 1).
 */
async function lerUltimosProjetos(): Promise<ProjetoDoc[] | null> {
  try {
    const { docs } = await listPublic<ProjetoDoc>({
      collection: 'projeto',
      params: { categoria: ALL_CATEGORIES, busca: '', page: 1 },
    })
    return docs
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split every listing makes.
    console.warn('[home] the últimos projetos read failed; rendering the error state.', erro)
    return null
  }
}

/** The carousel, the empty body or the error body — exactly one of the three (FR-017, FR-018). */
function trilhoDeProjetos(projetos: ProjetoDoc[] | null): ReactElement {
  if (projetos === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar os projetos."
        acao={{ label: 'Tentar novamente', href: '/' }}
      />
    )
  }

  if (projetos.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhum projeto publicado ainda."
        descricao="Os projetos do lab aparecem aqui assim que forem publicados."
        acao={{ label: 'Ver projetos', href: PROJETOS_PATH }}
      />
    )
  }

  return <ProjectCarousel label="Últimos projetos">{projetos.map(cardDe)}</ProjectCarousel>
}

/**
 * `ÚLTIMOS PROJETOS` (`home.md` § *Card `ÚLTIMOS PROJETOS`*).
 *
 * The footer link reads `VER MAIS PROJETOS`. The mockup draws `VER MAIS PROPLETOS`; that is a
 * typo in the art and the 2026-08-23 decision says so in as many words — it is written down
 * here because transcribing the mockup faithfully is the obvious way to get it wrong.
 */
function ultimosProjetos(projetos: ProjetoDoc[] | null): ReactElement {
  return (
    <section style={ESTILO.secao} aria-labelledby="ultimos-projetos">
      <header style={ESTILO.secaoTopo}>
        <h2 id="ultimos-projetos" style={ESTILO.secaoTitulo}>
          ÚLTIMOS PROJETOS
        </h2>
        <a href={PROJETOS_PATH} style={ESTILO.secaoLink}>
          VER MAIS PROJETOS ›
        </a>
      </header>
      {trilhoDeProjetos(projetos)}
    </section>
  )
}

/** The band draws three cards and asks for exactly three rows (FR-004). Missions beyond the
 *  third are reachable through `VER TODAS ›` — they are not fetched here to be discarded. */
const MISSOES_NO_DESTAQUE = 3

/**
 * The band's order: `ordemDestaque` ascending, with `titulo` as FR-003's declared tie-break.
 *
 * **An array, never `'ordemDestaque,titulo'`.** The comma form is REST-only — the local API an
 * RSC reaches calls `sanitizeSortQuery`, which does not split on it, and `buildOrderBy` then
 * wraps the whole string, resolves no column of that name and swallows the failure in a bare
 * `catch (_) { continue }`. What is left is the `-createdAt` it pushed unconditionally, so the
 * comma form orders by *neither* key: a band free to reshuffle between two page loads, which is
 * the exact failure FR-003 exists to prevent. Measured on `/ranking`
 * (`tests/public/ranking-ordem.test.ts`) and recorded on `FindArgs['sort']`.
 */
const ORDEM_DA_BANDA = ['ordemDestaque', 'titulo'] as const

/** One featured mission, populated one level. Structural rather than imported from the
 *  gitignored `payload-types.ts`, for the same reason {@link ProjetoDoc} is. */
type MissaoDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly descricao?: string
  readonly icone?: MidiaDoc | number | string | null
}

/**
 * The missions the team has marked for the Home (FR-004, FR-005, CLR-004).
 *
 * **Through the anonymous door, whether or not there is a session.** The band is public (US2),
 * and `getPublicScopedPayloadForRSC` is also what makes *"curation does not publish"* true by
 * mechanism rather than by a clause this function could forget: `missao` is in the publishable
 * set, so the door AND-s `status = publicado` onto whatever `where` it is handed. That is why
 * the `where` below carries **only** the curation flag — a status clause spelled here would be
 * a second opinion about publication, free to disagree with the door's.
 *
 * `null` is *"this read failed"* and `[]` is *"nothing is featured"* — the same three-way
 * contract {@link lerUltimosProjetos} models. An unresolved host is neither: it is a 404 for
 * the whole site and must never be caught as a block failure (FR-025).
 */
async function lerMissoesEmDestaque(): Promise<MissaoDoc[] | null> {
  try {
    const db = await getPublicScopedPayloadForRSC()
    const { docs } = await db.find<MissaoDoc>({
      collection: 'missao',
      where: { destaqueHome: { equals: true } },
      sort: [...ORDEM_DA_BANDA],
      limit: MISSOES_NO_DESTAQUE,
      // `icone` is a relationship; at depth 0 it is an id, which is not art.
      depth: 1,
    })
    return docs
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split every block here makes.
    console.warn('[home] the missões em destaque read failed; rendering the error state.', erro)
    return null
  }
}

/** Where the full catalogue lives. Written once so the band's link cannot drift from the route
 *  `/missoes` actually serves (FR-011). */
const MISSOES_PATH = '/missoes'

/**
 * FR-009's invitation, in the place CLR-002 empties: *"the invitation to sign in takes the place
 * the percentage would occupy"*.
 *
 * Once under the band rather than once per card, the arrangement `/missoes` already chose for
 * the same sentence — three identical invitations in a three-card grid is the same fact said
 * three times. It goes to `LOGIN_HREF`, the shell's own constant, exactly as the hero's CTA
 * does, so the day sign-up lands this link moves with the shell rather than being retyped here.
 */
const CONVITE_PESSOAL = 'Entre na sua conta para acompanhar o seu progresso em cada missão.'

/**
 * CLR-013, and the reason this string exists at all.
 *
 * `indisponivel` draws no bar — the personal read is precisely what failed, so a bar would be a
 * claim about a maker whose progress the page does not have. Rendered *silently*, though, the
 * card is character-for-character the signed-out one, and a signed-in maker reads that as having
 * been logged out. So the band says so (SC-023: wording a signed-out visitor never sees).
 *
 * It offers no `Tentar novamente` link: the missions loaded, so there is no failed navigation to
 * repeat — reloading is the whole of the retry, and an action pointing at `/` would suggest the
 * page itself is broken when only the overlay is.
 */
const PROGRESSO_INDISPONIVEL =
  'Não conseguimos carregar o seu progresso nas missões agora. Atualize a página para tentar de novo.'

/**
 * The one line under the band that is about the reader rather than about the missions.
 *
 * Four states, three of which draw no percentage, and only two of which say anything:
 *
 *   * `anonimo` → the invitation (FR-009, CLR-002).
 *   * `indisponivel` → {@link PROGRESSO_INDISPONIVEL} (CLR-013).
 *   * `sem-perfil` → **nothing**. A login with a profile in another lab and none here (002 §
 *     CLR-002) has no progress on *these* missions, and inviting a signed-in person to sign in
 *     is a loop they cannot leave.
 *   * `maker` → nothing either: their answer is the bars themselves.
 */
function avisoPessoal(visitante: EstadoPessoal): ReactNode {
  if (visitante.tipo === 'anonimo') {
    return (
      <p style={ESTILO.aviso}>
        {`${CONVITE_PESSOAL} `}
        <a href={LOGIN_HREF} style={ESTILO.secaoLink}>
          Entrar
        </a>
      </p>
    )
  }

  if (visitante.tipo === 'indisponivel') return <p style={ESTILO.aviso}>{PROGRESSO_INDISPONIVEL}</p>

  return null
}

/** A populated `icone` relationship's URL. An unpopulated one is an id, which is not art — the
 *  same narrowing `/missoes` performs on the same field. */
const urlDoIcone = (icone: MissaoDoc['icone']): string | undefined =>
  typeof icone === 'object' && icone !== null && typeof icone.url === 'string' ? icone.url : undefined

/**
 * The card's bar — and the reason a signed-out visitor gets none (FR-009, CLR-002).
 *
 * *"A signed-out visitor sees the mission card with **no** progress bar value — not a bar at
 * 0%"*: 0% is a claim about how far along somebody is, and there is nobody. `/missoes` reached
 * the same conclusion against 005's FR-024 and wrote it down — *"it is indistinguishable from a
 * maker who has not started"* — and two surfaces of one product must not answer this differently.
 *
 * The arithmetic is FR-007's, **imported rather than restated**: `ETAPAS_POR_ESTADO` is the one
 * expression of the two-step curve, and `ProgressBar` takes value/max in these units precisely
 * so the rounding stays in `percentOf` and this file never computes a percentage.
 */
function barraDaMissao(missao: MissaoDoc, visitante: EstadoPessoal): ReactNode {
  if (visitante.tipo !== 'maker') return null

  const submissao = visitante.submissoes.get(String(missao.id))
  const estado = estadoDe(submissao)
  const etapas = estado === undefined ? 0 : ETAPAS_POR_ESTADO[estado]

  return (
    <ProgressBar
      value={etapas}
      max={ETAPAS_DA_MISSAO}
      label={`Missão: ${missao.titulo ?? ''}`}
    />
  )
}

/**
 * One card: *"ícone outline, título, descrição e barra de progresso"* (home.md § *Seção "MISSÕES
 * EM DESTAQUE"*), on the accent-outlined surface the same paragraph draws.
 *
 * The icon is `alt=""` — decorative, deliberately. The title is real text directly beneath it,
 * so an `alt` describing the same mission makes a screen reader announce it twice; this is the
 * rule `/missoes` already applies to this very field.
 */
function cartaoDaMissao(missao: MissaoDoc, visitante: EstadoPessoal): ReactElement {
  const icone = urlDoIcone(missao.icone)

  return (
    <article key={String(missao.id)} style={ESTILO.cartao}>
      {icone !== undefined && <img src={icone} alt="" width={48} height={48} style={ESTILO.icone} />}
      <h3 style={CARD_TITLE_STYLE}>{missao.titulo}</h3>
      <p style={ESTILO.descricao}>{missao.descricao}</p>
      {barraDaMissao(missao, visitante)}
    </article>
  )
}

/**
 * `MISSÕES EM DESTAQUE` (home.md § *Seção "MISSÕES EM DESTAQUE"*) — the band, and the one link
 * that makes `/missoes` reachable.
 *
 * **`VER TODAS ›` is the whole of US6.** `/missoes` shipped in 005 reachable only by typing its
 * URL, and reported that gap against itself rather than editing the site's navigation to close
 * it; CLR-009 keeps the shell at six tabs and names this link as the answer. It sits outside the
 * card list on purpose — an empty band is exactly when a visitor wants the full catalogue
 * (US6's own edge), so the link does not depend on there being a card beside it.
 *
 * **The heading is drawn for all three outcomes (T027, FR-022).** `null` is *"this read
 * failed"* and `[]` is *"this lab features nothing"*, and neither of them is silence: a section
 * that vanishes on failure is CLR-004 with the sign flipped — a visitor reads it as a product
 * that does not have missions at all, which is exactly what the panels were held back to avoid
 * saying by accident. So the band always draws its header, its link, and exactly one of three
 * bodies: the cards, the empty wording `home.md` gives it, or the shared error state.
 */
function corpoDaBanda(missoes: MissaoDoc[], visitante: EstadoPessoal): ReactNode {
  if (missoes.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        // `home.md` § Estados gives each block its own sentence, and this one is the band's:
        // *"sem missões em destaque → 'Nenhuma missão ativa no momento'"*. It read the
        // RANKING's sentence until `home-desfechos.test.ts` caught the borrowed copy — which is
        // what FR-024 means by each block naming its OWN emptiness.
        titulo="Nenhuma missão ativa no momento."
        descricao="As missões em destaque do lab aparecem aqui assim que a equipe marcar uma."
        acao={{ label: 'Ver todas as missões', href: MISSOES_PATH }}
      />
    )
  }

  return (
    <>
      <div style={ESTILO.grade}>
        {missoes.map((missao) => cartaoDaMissao(missao, visitante))}
      </div>
      {/* Only where there are cards: a lab with nothing featured has no percentage to invite
          anybody to, and no missing progress to apologise for. */}
      {avisoPessoal(visitante)}
    </>
  )
}

function missoesEmDestaque(missoes: MissaoDoc[] | null, visitante: EstadoPessoal): ReactNode {
  return (
    <section style={ESTILO.secao} aria-labelledby="missoes-destaque">
      <header style={ESTILO.secaoTopo}>
        <h2 id="missoes-destaque" style={ESTILO.secaoTitulo}>
          MISSÕES EM DESTAQUE
        </h2>
        <a href={MISSOES_PATH} style={ESTILO.secaoLink}>
          VER TODAS ›
        </a>
      </header>
      {/* The failed body says only that the read failed. Naming the emptiness here — *"nenhuma
          missão ativa"* — would tell a lab WITH featured missions that it has none, which is the
          one sentence a failure must never borrow (FR-022, US8). */}
      {missoes === null ? (
        <EmptyState
          variant="erro"
          titulo="Não foi possível carregar as missões."
          acao={{ label: 'Tentar novamente', href: '/' }}
        />
      ) : (
        corpoDaBanda(missoes, visitante)
      )}
    </section>
  )
}

/**
 * `nivelDoLab` takes a `PayloadRequest` for ONE purpose — building the store it reads through —
 * and {@link lerNivelDoLab} supplies that store itself, so nothing on this object is ever
 * touched.
 *
 * `as never` rather than a plausible-looking request, for the reason `/minha-conta/excluir`
 * records at its own injected call: a fabricated `req` carrying headers would look like the
 * default path works, and the default path is precisely what cannot work from a server
 * component — it authenticates nobody, so `scopedAccess()` refuses the first read.
 */
const SEM_PEDIDO = {} as never

/**
 * The lab's own level, for the card `home.md` draws as the collective achievement (FR-012).
 *
 * **`nivelDoLab`'s first caller** — it has had none since 005 shipped it — and it arrives with
 * the two obligations plan § D1 names:
 *
 *   1. **It catches.** `nivelDoLab` is documented to *throw* when the organization has no
 *      `regrasXp` row: inventing a curve would render a level nobody's economy produced. So a
 *      lab with a broken economy renders this card's error state and nothing else on the page
 *      moves (FR-023).
 *   2. **`TenantUnresolvedError` is rethrown into `notFound()`**, exactly as the readers above
 *      do it. Catching it broadly would swallow the page's own 404 and draw an error card on a
 *      host that resolves to no organization at all (FR-025).
 *
 * **Two outcomes, never three** (CLR-011). This returns `NivelDoLab | null` rather than the
 * three-way `T[] | [] | null` the list reads model, because `nivelDoLab` returns an object or
 * throws and there is no third thing for it to return. A lab at level 0 with an empty ledger is
 * a *value* — `[]`'s question, *"is this lab empty enough?"*, is one no card should be inventing
 * an answer to.
 *
 * ⚠ **A visitor with no session reaches the error state, and that is a REPORTED GAP rather than
 * a decision this task made.** `xpLedger.read` and `regrasXp.read` are both `scopedAccess()`,
 * which refuses an anonymous reader outright, and the anonymous door has no route to either
 * collection: `assertPubliclyReadable` admits one only through a queryable `status` or a
 * `publicList` declaration, and the ledger and the economy carry neither. FR-016 — *"the card is
 * visible to a signed-out visitor: the lab's level is collective and public"* — therefore has no
 * path in this tree. Closing it means a projected public reader of the same shape as
 * `readPublicRanking` and a **sixth** named exemption in `lib/tenancy`, which is a change to the
 * anonymous security surface and gets its own written argument (plan § D2) rather than being
 * widened from a page. FR-031's instruction for a path with no route is to report it; this is
 * the report.
 */
async function lerNivelDoLab(): Promise<NivelDoLab | null> {
  try {
    const db = await getTenantScopedPayloadForRSC()
    // Awaited INSIDE the try: a returned promise would reject outside this catch, and the throw
    // this function exists to contain is the one `rulesForTenant` raises during the read.
    return await nivelDoLab(SEM_PEDIDO, { getStore: async () => db })
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    // Loud in the log, contained on the page — the same split every block here makes.
    console.warn('[home] the nível do lab read failed; rendering the card error state.', erro)
    return null
  }
}

/** The heading's id, so the section is named by the words a reader sees. */
const NIVEL_DO_LAB_ID = 'nivel-do-lab'

/** Two digits, as the mockup draws it (`NÍVEL 07`). The number is `nivelDoLab`'s; the padding is
 *  typography and must never become arithmetic. */
const rotuloDoNivel = (nivel: number): string => `NÍVEL ${String(nivel).padStart(2, '0')}`

/**
 * The card itself: a level and a bar, and — deliberately — nothing else.
 *
 * `home.md` § *Faixa de 3 cards* draws a `Próxima recompensa:` block under the bar and a
 * `1250 / 2000 XP` counter beside it. Both are mockup record: the PO removed the collective
 * reward from v1 on 2026-08-24 (FR-014), and the counter's numbers are *illustrative* of an
 * economy that grants 1 XP per action (FR-013). What replaces the counter is not a smaller
 * counter — it is `progresso`, which is the same fact in the lab's real units.
 *
 * The failed outcome is the shared `EmptyState` with `variant="erro"`, the surface every block
 * on this page fails onto, and its action is `/` because reloading the Home *is* the retry.
 */
function cartaoNivelDoLab(lab: NivelDoLab | null): ReactElement {
  if (lab === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar o nível do lab."
        acao={{ label: 'Tentar novamente', href: '/' }}
      />
    )
  }

  return (
    <article style={ESTILO.cartao}>
      <p style={ESTILO.nivel}>{rotuloDoNivel(lab.nivel)}</p>
      {/* value/max in `nivelDoLab`'s own units — the XP earned INSIDE the current level over
          that level's width (FR-013), never a running total and never a percentage computed
          here: `ProgressBar` owns the one rounding, so the fill and the printed number cannot
          disagree. */}
      <ProgressBar value={lab.progresso.atual} max={lab.progresso.de} label="Nível do lab" />
    </article>
  )
}

/**
 * `NÍVEL DO LAB` (home.md § *Faixa de 3 cards*).
 *
 * The heading is drawn for **both** outcomes. A failed card under no title is a silence a
 * visitor reads as *"this lab has no level"* — CLR-004's failure mode said a different way — and
 * FR-027 asks for the section itself, not only for its happy path.
 */
function nivelDoLabSecao(lab: NivelDoLab | null): ReactElement {
  return (
    <section style={ESTILO.secao} aria-labelledby={NIVEL_DO_LAB_ID}>
      <header style={ESTILO.secaoTopo}>
        <h2 id={NIVEL_DO_LAB_ID} style={ESTILO.secaoTitulo}>
          NÍVEL DO LAB
        </h2>
      </header>
      {cartaoNivelDoLab(lab)}
    </section>
  )
}

/**
 * The places the Home draws, and the bound the read is issued with (FR-017).
 *
 * `home.md` § *Faixa de 3 cards*: *"lista top-5"*. `/ranking` draws the whole board under its
 * own bound; this is the card's, and it is the **query's** limit rather than a slice of a longer
 * answer — rows nobody sees are rows this page paid for, on the one page SC-006 measures an LCP
 * budget against.
 */
const LUGARES_NO_RANKING = 5

/** The heading's id, so the section is named by the words a reader sees. */
const RANKING_ID = 'ranking-makers'

/** One avatar frame in source pixels — the proportions `criar-conta` declares and `/ranking`
 *  renders at. The render is composed from that frame, so measuring the scale against anything
 *  else would blur it. */
const LARGURA_DO_QUADRO = 32

/** The width a row would like for it. `PixelImage` clamps down to a whole multiple, so this is
 *  a request and never a stretch. */
const LARGURA_NA_LINHA = LARGURA_DO_QUADRO * 2

/** A populated render's URL. An unpopulated relationship is an id, and an id is not a picture. */
const urlDoAvatar = (avatar: RankingRow['avatarRender']): string | undefined =>
  typeof avatar === 'object' && avatar !== null && typeof avatar.url === 'string'
    ? avatar.url
    : undefined

/** The XP a profile carries. 005 leaves the total **uncapped** (its FR-043), so it is printed as
 *  it is stored; only `nivel` stops at the curve's ceiling, and the card does not draw it. */
const xpDe = (perfil: RankingRow): number =>
  typeof perfil.xpTotal === 'number' && Number.isFinite(perfil.xpTotal) ? perfil.xpTotal : 0

/**
 * Two digits, as the mockup draws them: `01 … 05` (home.md, *"posição em dois dígitos"*).
 *
 * `/ranking` numbers the full board `1º` — an ordinal, because it runs past nine — and this card
 * numbers a fixed five. The two are different typography of the same fact, and the padding must
 * never become arithmetic: the *place* is the row's position in the order the query returned.
 */
const rotuloDaPosicao = (posicao: number): string => String(posicao).padStart(2, '0')

/**
 * One place on the card: the position, the avatar, the name, the `@handle` and the XP total —
 * the five things FR-018 names, in the order it names them.
 *
 * **The name is the public identity, not the handle** (home.md, round 4, 2026-08-24): the
 * mockup's `@laser.nick` handles are illustrative and superseded, and `formatHandle` is the one
 * place that decides a stored `maria` is shown as `@maria`.
 *
 * **A profile whose render has not been composed draws no `<img>` at all** (FR-019) — exactly
 * what `/ranking` draws for the same row. `avatarRender` is nullable while the compositor is
 * blocked (004 T042 / ISS-003), an unpopulated relationship is an id rather than a picture, and
 * a broken image is worse than a frame. A second answer here would be a second rule to keep in
 * step with that page.
 *
 * **Not an anchor**, and that is CLR-007: the public maker profile is a later spec, so a row
 * made clickable now would point at a route this product does not serve.
 */
function linhaDoRanking(perfil: RankingRow, posicao: number): ReactElement {
  const avatar = urlDoAvatar(perfil.avatarRender)
  const handle = formatHandle(perfil.handle ?? '')

  return (
    <li key={String(perfil.id ?? posicao)} style={ESTILO.linhaRanking}>
      <span style={ESTILO.posicao}>{rotuloDaPosicao(posicao)}</span>
      {avatar !== undefined && (
        <PixelImage
          src={avatar}
          baseWidth={LARGURA_DO_QUADRO}
          targetWidth={LARGURA_NA_LINHA}
          alt={`Avatar de ${handle}`}
        />
      )}
      <span style={ESTILO.identidade}>
        <span style={CARD_TITLE_STYLE}>{perfil.nome}</span>
        <span style={ESTILO.handle}>{handle}</span>
      </span>
      <span style={ESTILO.xp}>{`${xpDe(perfil)} XP`}</span>
    </li>
  )
}

/**
 * This lab's top five, through the one door that serves them to a visitor with no session
 * (FR-017).
 *
 * `readPublicRanking` already draws the distinction every reader on this page draws — `null` for
 * a failed read, `[]` for a lab whose makers have earned nothing yet — and it *rethrows*
 * `TenantUnresolvedError` so its caller can answer it. This is that answer: a host belonging to
 * no lab is the **site's** 404 (FR-025), never an error card on a page that should not exist.
 *
 * Nothing else is caught. Every other failure is already `null` by the time it returns, so a
 * broad `catch` here could only swallow a bug in this file and render it as a data problem.
 */
async function lerRankingDeMakers(): Promise<RankingRow[] | null> {
  try {
    return await readPublicRanking(LUGARES_NO_RANKING)
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    throw erro
  }
}

/**
 * `RANKING MAKERS` (home.md § *Faixa de 3 cards*) — the top five and the footer link to the
 * board they are the top of.
 *
 * **The order is not this card's** (FR-021). The rows arrive ordered from `readPublicRanking`,
 * which carries `/ranking`'s own `ORDENACAO_DO_RANKING` — `-xpTotal` with `handle` as the
 * declared tie-break — and rendering by index is what makes the number a *place* rather than
 * something this file decided. A sort here would be a second ranking, free to disagree with the
 * board `VER RANKING COMPLETO` leads to between two page loads.
 *
 * **Three outcomes, and the empty one is the dangerous one (T027, FR-022).** *"Ainda sem makers
 * no ranking"* is the sentence `/ranking` shipped by accident against a lab that HAD makers —
 * the live defect T013 records — so it is reserved for `[]` and never borrowed by `null`, which
 * says only that the read failed and offers `Tentar novamente`. The heading and the footer link
 * are drawn for all three: a card that disappears on failure reads as a lab with no board at
 * all, and CHK051 asks for the link on the empty one by name.
 */
function corpoDoRanking(linhas: RankingRow[] | null): ReactNode {
  if (linhas === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar o ranking."
        acao={{ label: 'Tentar novamente', href: '/' }}
      />
    )
  }

  if (linhas.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Ainda sem makers no ranking."
        descricao="Assim que alguém ganhar XP no lab, o pódio aparece aqui."
        acao={{ label: 'Ver ranking completo', href: RANKING_PATH }}
      />
    )
  }

  return (
    <ol style={ESTILO.listaRanking}>
      {linhas.map((perfil, indice) => linhaDoRanking(perfil, indice + 1))}
    </ol>
  )
}

function rankingMakers(linhas: RankingRow[] | null): ReactNode {
  return (
    <section style={ESTILO.secao} aria-labelledby={RANKING_ID}>
      <header style={ESTILO.secaoTopo}>
        <h2 id={RANKING_ID} style={ESTILO.secaoTitulo}>
          RANKING MAKERS
        </h2>
      </header>
      {corpoDoRanking(linhas)}
      {/* `home.md` draws this link in the card's footer, and it is built from `/ranking`'s own
          exported path — the route moves in one edit, with no href left pointing at the old
          one (FR-020). */}
      <a href={RANKING_PATH} style={ESTILO.secaoLink}>
        VER RANKING COMPLETO
      </a>
    </section>
  )
}

/**
 * `/` — Home v1: the hero, `ÚLTIMOS PROJETOS`, and the footer the layout supplies.
 *
 * The read is awaited *here* rather than in a nested async component, so the whole tree is
 * resolved before it leaves this function — which is what lets the suite call the page and walk
 * what it returns, with no renderer (CLR-003).
 *
 * @example rendered at `http://localhost:3000/` with the `Host` header the tenancy layer resolves
 */
export default async function HomePage(): Promise<ReactElement> {
  // The four block reads leave together, in ONE `Promise.all` (FR-026, SC-012, CLR-006). They
  // are independent by construction — the carousel, the band, the ledger sum and the board
  // share no input — so nothing but the shape of this statement decides whether they overlap,
  // and awaited one at a time they would put three extra round trips ahead of the hero's bytes
  // on the page whose hero IS the LCP element. `tests/public/home-concorrencia.test.ts` § 1
  // proves the overlap by event order rather than by a clock: all four `emitida:` before the
  // first `resolvida:`. A reader that rejects still rejects here — each one turns
  // `TenantUnresolvedError` into `notFound()` on its own (FR-025), and `Promise.all` carries
  // that throw out of this line unchanged.
  const [projetos, missoes, lab, ranking] = await Promise.all([
    lerUltimosProjetos(),
    lerMissoesEmDestaque(),
    lerNivelDoLab(),
    lerRankingDeMakers(),
  ])
  // The FIFTH read, deliberately outside the four above (CLR-012): it needs the mission ids, so
  // it cannot be issued beside them, and a visitor with no session never makes it at all. It
  // resolves to a state rather than throwing — `indisponivel` costs the percentages, never the
  // band (FR-010) — and it is asked only about the missions actually on screen, so a failed
  // catalogue read never becomes a second read for rows nobody will see.
  const visitante = await estadoPessoal(missoes ?? [])

  return (
    <>
      {preloadDoHero()}
      <style href="fablab-home-hero" precedence="default">
        {HOME_HERO_CSS}
      </style>
      <main style={ESTILO.pagina}>
        <section className={CLASSE.hero}>
          {arteDoHero()}
          {textoDoHero()}
        </section>
        {missoesEmDestaque(missoes, visitante)}
        {nivelDoLabSecao(lab)}
        {rankingMakers(ranking)}
        {ultimosProjetos(projetos)}
      </main>
    </>
  )
}

/**
 * Every style this page declares, in one object — the shape `projetos.md`'s page uses, and for
 * the same reason: the suite runs at `node` with no DOM, so a class name would be assertable
 * only as text in two files, while a style object is the decision itself. Every colour is a
 * token (FR-027); there is no hex here and there must never be one.
 */
const ESTILO: Record<string, CSSProperties> = {
  pagina: { display: 'flex', flexDirection: 'column' },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    lineHeight: 1.05,
    textTransform: 'uppercase',
  },
  // The third line is the accent, and the accent is the ONE token an organization themes
  // (CLR-001) — so the hero co-brands with no second code path.
  tituloAcento: { color: 'var(--color-primary)' },
  paragrafo: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    lineHeight: 1.5,
  },
  cta: {
    // The canonical primary (visual-identity.md, 2026-08-23), spread rather than restated: the
    // two properties after it are the ones an <a> needs and a <button> does not.
    ...PRIMARY_BUTTON_STYLE,
    alignSelf: 'flex-start',
    display: 'inline-block',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
  },
  secao: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    padding: 'var(--space-10) var(--space-5)',
    background: 'var(--surface-page)',
    color: 'var(--text-on-dark)',
  },
  secaoTopo: {
    display: 'flex',
    // The heading and the link are a row on a wide viewport and two rows when the words no
    // longer fit, which is the mockup's arrangement without a breakpoint to maintain.
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
  },
  secaoTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    textTransform: 'uppercase',
  },
  grade: {
    display: 'grid',
    // Three across where there is room, and fewer where there is not — the mockup's "grid de 3
    // cards" without a breakpoint to keep in step with the shell's.
    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
    gap: 'var(--space-5)',
  },
  // "contorno colorido sobre navy" — the design system's own card surface, taken rather than
  // restated, so the band follows a change to the canonical border and radius.
  cartao: cardStyle('primary'),
  icone: { width: 'var(--space-8)', height: 'var(--space-8)' },
  descricao: { margin: 0 },
  // The overlay's one line — smaller than the cards' own copy, because it is about the reader
  // rather than about a mission.
  aviso: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  // The card's own title, in the accent — the one token an organization themes (CLR-001), and
  // the same pairing `secaoLink` below already makes on this surface.
  nivel: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-2xl)',
    color: 'var(--color-primary)',
  },
  secaoLink: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-primary)',
    textTransform: 'uppercase',
  },
  // The board: five rows stacked, with the list's own numbering suppressed — the position is
  // drawn in two digits (FR-018) and a marker beside it would number every place twice.
  listaRanking: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    margin: 0,
    padding: 0,
  },
  // "contorno colorido sobre navy" — the same card surface the band's cards take, so a change to
  // the canonical border and radius reaches both.
  linhaRanking: {
    ...cardStyle('primary'),
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },
  // `--color-amarelo` is the palette's own role for *"XP, rewards, mission icons, numbering"*
  // (palette.css), which is this number and the total at the end of the row.
  posicao: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    color: 'var(--color-amarelo)',
    minWidth: 'var(--space-6)',
  },
  identidade: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 },
  // No colour of its own: the handle sits under the name on the page's own navy, where
  // `--text-on-dark` is already the scored pair. Smaller, because it is the identifier and the
  // name is the identity (home.md, round 4).
  handle: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  xp: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-lg)',
    color: 'var(--color-amarelo)',
  },
}
