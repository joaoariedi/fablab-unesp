import type { ReactElement, ReactNode } from 'react'

import { formatHandle } from './Card'

/**
 * T011 / FR-004 — the project card the mockups draw.
 *
 * `projetos.md` § *Grid de projetos* decides every part of it: *"Card de projeto (contorno fino
 * claro, cantos levemente arredondados, fundo navy): **foto** … sangrada de borda a borda
 * (proporção medida no mockup ~3:2); **chip de categoria** rosa com texto navy em caps,
 * sobreposto no canto inferior esquerdo da foto; **título** em display caps; **descrição**
 * curta em duas linhas; **rodapé do card** (separado por linha divisória): avatar pixel + nome
 * + `@nomesobrenome` + `NÍVEL n` … ícone de coração outline rosa + contador de curtidas e,
 * após divisória vertical, seta `→` rosa (ação principal do card)"*. § *Adaptação mobile* adds
 * the one measurement the desktop section does not have: *"foto em 16:9"*.
 *
 * ── Why this is not a variant of `Card` ─────────────────────────────────────────────────────
 *
 * `Card` (feature 001) is the base content card: a chip, a title, a body and an author strip,
 * with no photo and no action. This one leads with a bled photo carrying an overlaid chip, and
 * ends in a divider-separated action row. Folding them together would mean a `Card` whose chip
 * is sometimes overlaid on an image it sometimes has — one component with two layouts and a
 * flag to choose, which is how both stop being reviewable. What IS shared is shared: the handle
 * is printed by `Card.formatHandle`, because `@@mariasilva` must be impossible in one place.
 *
 * ── Why the like control is a slot and the count is not ─────────────────────────────────────
 *
 * FR-015 shows the count to everyone and opens the account invitation when a visitor clicks the
 * heart. The clicking half is `LikeButton`, one of the six islands FR-024 allows, and it is not
 * this task's file. If the card rendered it, every listing would ship one client boundary per
 * card — twelve on a full page — which is the failure FR-024 exists to prevent. So the card
 * renders the static count, and takes the island as `curtir` when a page has one to give.
 *
 * ── Why the arrow is the only link ──────────────────────────────────────────────────────────
 *
 * The page spec calls the arrow *"a ação principal do card"*. A card that also linked its title
 * would give a keyboard two tab stops and a screen reader two entries for one destination. The
 * arrow therefore carries an `aria-label` naming the project: twelve links reading "Ver projeto"
 * are twelve links a screen-reader user cannot tell apart in a links list.
 *
 * A server component: no state, no handler, no width read anywhere (FR-024). Which aspect the
 * photo takes at each design target is `CARD_PROJETO_CSS`, not JavaScript.
 */

/** The class names, in one place: the markup and `CARD_PROJETO_CSS` must agree, and a typo in
 *  either is an unstyled element or a breakpoint that switches nothing. */
const CLASS = {
  card: 'fl-card-projeto',
  media: 'fl-card-projeto__media',
  categoria: 'fl-card-projeto__categoria',
  corpo: 'fl-card-projeto__corpo',
  titulo: 'fl-card-projeto__titulo',
  descricao: 'fl-card-projeto__descricao',
  rodape: 'fl-card-projeto__rodape',
  autor: 'fl-card-projeto__autor',
  nivel: 'fl-card-projeto__nivel',
  acoes: 'fl-card-projeto__acoes',
  curtidas: 'fl-card-projeto__curtidas',
  seta: 'fl-card-projeto__seta',
  oculto: 'fl-card-projeto__oculto',
} as const

/** The author strip, as the card footer prints it. */
export interface CardProjetoAutor {
  /**
   * The pixel avatar, passed in rather than built here — `PixelImage` owns the integer scale
   * clamp (SC-008), and a card drawing its own `<img>` would be a second place a fractional
   * scale could enter. Optional: an author may have no avatar yet.
   */
  readonly avatar?: ReactNode
  /** The person's name, up to 60 characters (projetos.md, round 4 — it is the name that shows,
   *  not the mockups' `MAKER_X`). */
  readonly nome: string
  /** `nomesobrenome`, with or without the leading `@` — `formatHandle` is idempotent. */
  readonly handle: string
  /** 1–10; the mockups' `NÍVEL 7` is illustrative and the real ceiling is 10 (gamification.md). */
  readonly nivel: number
}

export interface CardProjetoProps {
  readonly titulo: string
  /** `descricao_curta`, ~120 characters — the cascade clamps it to the mockup's two lines. */
  readonly descricao: string
  /** The category name as the CMS stores it, in natural case: the caps are the cascade's. */
  readonly categoria: string
  /** The detail page, `/projetos/{slug}` — the arrow's destination. */
  readonly href: string
  /** `imagem_capa`, already an element: this package resolves no URLs and knows no image loader. */
  readonly capa: ReactNode
  readonly autor: CardProjetoAutor
  readonly curtidas: number
  /**
   * The FR-015 like island, when a page has one to place. Absent, the card prints the count as
   * text — the visitor still sees it, and the page ships no client boundary.
   */
  readonly curtir?: ReactNode
}

/**
 * The card, mobile-first: 390 is the base layer and 834 is additive (FR-021, layout tokens).
 *
 * Exported so the workbench and the suite read the decision rather than restate it.
 */
export const CARD_PROJETO_CSS = `
.${CLASS.card} {
  display: flex;
  flex-direction: column;
  /* "contorno fino claro", "fundo navy", "cantos levemente arredondados" — every value a token
     (FR-027); the radius is the same md step the button and the base card use. */
  border: 1px solid var(--color-claro);
  background: var(--color-navy);
  border-radius: var(--radius-md);
  /* What makes the photo "sangrada de borda a borda": without it the image squares off the two
     top corners the border has just rounded. */
  overflow: hidden;
  color: var(--color-claro);
  font-family: var(--font-body);
}
.${CLASS.media} {
  position: relative;
  /* The phone measurement of § Adaptação mobile. The desktop ~3:2 arrives at 834 below —
     two measurements from two sections, not one averaged compromise. */
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.${CLASS.media} > * {
  display: block;
  width: 100%;
  height: 100%;
  /* The cover is content-sized art in an aspect-ratio box; a contained fit would letterbox it
     against the navy and lose the bleed the design asks for. */
  object-fit: cover;
}
.${CLASS.categoria} {
  position: absolute;
  /* "no canto inferior esquerdo da foto" — logical properties, so a right-to-left build moves
     it with the text rather than leaving it stranded. */
  inset-inline-start: var(--space-3);
  inset-block-end: var(--space-3);
  background: var(--color-primary);
  color: var(--color-navy);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  /* The caps belong to the cascade, never to the data: the category is a CMS field, and
     uppercasing the string would put presentation into the content and hand a screen reader a
     word some engines spell out letter by letter. */
  text-transform: uppercase;
}
.${CLASS.corpo} {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
}
.${CLASS.titulo} {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  /* One of the three surfaces FR-003 puts under the themed accent (CTAs, active tabs, card
     titles), never the raw pink behind it — the two are identical for CITe and diverge only
     once a second organization exists (CLR-001). */
  color: var(--color-primary);
  text-transform: uppercase;
}
.${CLASS.descricao} {
  margin: 0;
  font-size: var(--text-sm);
  /* "Descrição curta em duas linhas": clamped by the cascade rather than truncated in the data,
     so search still matches the whole sentence and a copy takes all of it. */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
.${CLASS.rodape} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  /* "separado por linha divisória". Mixed from the light token rather than painted with it at
     full strength: a solid claro rule reads as a second card edge. */
  border-top: 1px solid color-mix(in srgb, var(--color-claro) 30%, transparent);
}
.${CLASS.autor} {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  min-width: 0;
}
.${CLASS.nivel} {
  text-transform: uppercase;
  font-family: var(--font-display);
}
.${CLASS.acoes} {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}
.${CLASS.curtidas} {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-primary);
  font-size: var(--text-sm);
}
.${CLASS.seta} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* FR-022: at least 44x44 on the compact breakpoints. Written unconditionally — a target that
     is only large below 834 is a rule nobody can check on the device they are holding. */
  min-width: 44px;
  min-height: 44px;
  color: var(--color-primary);
  text-decoration: none;
  font-size: var(--text-lg);
  /* "após divisória vertical" — the separator between the heart and the arrow. */
  border-inline-start: 1px solid color-mix(in srgb, var(--color-claro) 30%, transparent);
}
.${CLASS.seta}:focus-visible {
  /* projetos.md § Estados: "Foco sempre visível via outline de 2px (navegação por teclado,
     WCAG AA)" — FR-023 and SC-009. */
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.${CLASS.oculto} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (min-width: 834px) {
  .${CLASS.media} {
    /* "proporção medida no mockup ~3:2" (§ Grid, desktop). */
    aspect-ratio: 3 / 2;
  }
}
`

/**
 * The like count as text.
 *
 * A function returning the element, NOT a nested component: a nested component is expanded only
 * by a renderer, and this package has none (CLR-003), so calling it keeps the whole tree
 * readable to the `node` suite that is the only gate this card has until Playwright.
 */
function contadorCurtidas(curtidas: number): ReactElement {
  return (
    <span className={CLASS.curtidas}>
      {/* The glyph is decoration: announced, "♥" is read as "black heart suit" or skipped, so
          the number needs a word of its own. */}
      <span aria-hidden={true}>♥</span>
      <span>{curtidas}</span>
      <span className={CLASS.oculto}>curtidas</span>
    </span>
  )
}

function rodape(autor: CardProjetoAutor, curtidas: number, titulo: string, href: string, curtir?: ReactNode): ReactElement {
  return (
    <footer className={CLASS.rodape}>
      {/* Not a link yet, on purpose: the author block leads to the maker's public profile (PO,
          2026-08-24), and that page is specified with features 004/005. An anchor to a route
          this feature does not create is a 404 the mockup did not ask for. */}
      <span className={CLASS.autor}>
        {autor.avatar}
        <span>{autor.nome}</span>
        <span>{formatHandle(autor.handle)}</span>
        <span className={CLASS.nivel}>{`Nível ${autor.nivel}`}</span>
      </span>
      <span className={CLASS.acoes}>
        {curtir ?? contadorCurtidas(curtidas)}
        <a className={CLASS.seta} href={href} aria-label={`Ver projeto: ${titulo}`}>
          <span aria-hidden={true}>→</span>
        </a>
      </span>
    </footer>
  )
}

/**
 * One project, as the Projetos grid and the Home carousel draw it.
 *
 * @example
 * <CardProjeto titulo="Luminária paramétrica" categoria="Impressão 3D" curtidas={32}
 *              href="/projetos/luminaria-parametrica" capa={<PixelImage … />}
 *              descricao="Luminária decorativa impressa em 3D."
 *              autor={{ nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 }} />
 */
export function CardProjeto({
  titulo,
  descricao,
  categoria,
  href,
  capa,
  autor,
  curtidas,
  curtir,
}: CardProjetoProps): ReactElement {
  return (
    <article className={CLASS.card}>
      <div className={CLASS.media}>
        {capa}
        <span className={CLASS.categoria}>{categoria}</span>
      </div>
      <div className={CLASS.corpo}>
        <h3 className={CLASS.titulo}>{titulo}</h3>
        <p className={CLASS.descricao}>{descricao}</p>
      </div>
      {rodape(autor, curtidas, titulo, href, curtir)}
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href, so twelve cards on a page emit one stylesheet. */}
      <style href="fablab-card-projeto" precedence="default">
        {CARD_PROJETO_CSS}
      </style>
    </article>
  )
}
