import type { CSSProperties, ReactElement } from 'react'

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
 * ── What Home v1 does NOT have, and why that is the decision (CLR-004) ───────────────────────
 *
 * `home.md` describes `MISSÕES EM DESTAQUE`, `NÍVEL DO LAB` and `RANKING MAKERS` in as much
 * detail as it describes the carousel, so a reader of that document alone would build them.
 * Every one reads a table feature 005 has not created. They would not fail loudly — they would
 * render a lab at level 0, an empty ranking and three missions at 0%, which looks like a
 * product nobody uses rather than a section not shipped yet. `tests/public/home.test.ts` § 3
 * asserts their absence for exactly that reason: the same shape as the `PUBLICAÇÃO` tab that
 * shipped against CLR-009 because nothing tested the row that was supposed to be missing.
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
  CardProjeto,
  EmptyState,
  LikeButton,
  LOGIN_HREF,
  PIXEL_IMAGE_STYLE,
  PRIMARY_BUTTON_STYLE,
  ProjectCarousel,
} from '@fablab/ui'

import { listPublic } from '../../lib/public/listing'
import { ALL_CATEGORIES } from '../../lib/public/params'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

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
type ProjetoDoc = {
  readonly titulo?: string
  readonly slug?: string
  readonly descricaoCurta?: string
  readonly categoria?: { readonly nome?: string } | number | null
  readonly imagemCapa?: MidiaDoc | number | null
  readonly curtidas?: number
}

/**
 * The author strip, until feature 005 gives the collection an author.
 *
 * The same constant, and the same reasoning, as `projetos/page.tsx`: `CardProjeto.autor` is
 * required because the mockups draw the strip on every card, and `projeto` carries no `autor`
 * field at all — `Projeto.ts` defers it to feature 005's `perfilMaker`. The two honest options
 * were a fabricated maker on a public page or crediting the lab itself; this is the second.
 * It is duplicated rather than imported because the alternative is one page module importing
 * another, which is a dependency between routes that nothing else in this tree has.
 *
 * **Delete this the moment `autor` exists**, here and there, in one change.
 */
const AUTORIA_PENDENTE = { nome: 'Fab Lab', handle: 'fablab', nivel: 1 } as const

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
      autor={AUTORIA_PENDENTE}
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
  const projetos = await lerUltimosProjetos()

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
  secaoLink: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-primary)',
    textTransform: 'uppercase',
  },
}
