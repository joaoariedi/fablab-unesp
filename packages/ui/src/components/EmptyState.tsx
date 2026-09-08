import type { CSSProperties, ReactElement } from 'react'

import type { IsoShapeName } from '../shapes/geometry'
import { IsoShape } from '../shapes/IsoShape'
import { PRIMARY_BUTTON_STYLE } from './Button'

/**
 * T011 / FR-017, FR-018 — the one body every listing shows when it has nothing to show.
 *
 * `projetos.md` § *Estados e interações* decides both halves:
 *
 *   - **Vazio** — *"`Nenhum projeto encontrado.` + `Tente outra categoria ou limpe a busca.` +
 *     botão `LIMPAR FILTROS`, com ornamento isométrico"*;
 *   - **Erro** — *"`Não foi possível carregar os projetos.` + botão `TENTAR NOVAMENTE`"*.
 *
 * FR-017 and FR-018 say *every* listing, and the four listings name four different things —
 * projects, articles, classes, models. So the copy is the caller's and the shape is this
 * component's: one component with one arrangement, four wordings. The alternative, a component
 * that knows the four nouns, would need a fifth the day a listing is added.
 *
 * ── Why the action is a link ────────────────────────────────────────────────────────────────
 *
 * Clearing the filters **is** a URL — the listing's own path without the query — and retrying
 * is the URL that just failed. A `<button>` would need a handler, a handler needs `'use
 * client'`, and every listing would carry a client boundary for a control that is an anchor.
 * That is CLR-003's argument for numbered pagination, applied to the same page's other control.
 *
 * ── Why the fill is imported and the focus ring is not ──────────────────────────────────────
 *
 * `projetos.md`: *"todo botão primário desta página (`PUBLICAR PROJETO`, `CARREGAR MAIS`,
 * `LIMPAR FILTROS`, `TENTAR NOVAMENTE`, `CRIAR CONTA`) usa o estilo canônico do site — rosa
 * preenchido, texto navy, sombra dura deslocada"*. `PRIMARY_BUTTON_STYLE` **is** that decision,
 * so it is spread rather than retyped; a second copy would drift the moment the shadow changes.
 * What a style object cannot express is `:focus-visible`, and FR-023 requires the ring on every
 * interactive target — so the ring, and only the ring, travels as a class.
 *
 * A server component: no state, no handler (FR-024).
 */

const CLASS = {
  state: 'fl-empty-state',
  ornamento: 'fl-empty-state__ornamento',
  titulo: 'fl-empty-state__titulo',
  descricao: 'fl-empty-state__descricao',
  acao: 'fl-empty-state__acao',
  /** Applied to the root on a light page; the ink and the ornament both answer to it. */
  light: 'fl-empty-state--light',
} as const

/** Which of the two defined states this is. */
export type EmptyStateVariant = 'vazio' | 'erro'

/** Which background the state sits on: the navy base, or a white content page. */
export type EmptyStateSurface = 'navy' | 'light'

/** The clearing or retrying action — a destination, never a handler. */
export interface EmptyStateAcao {
  /** In natural case; the caps of the mockup are the cascade's. */
  readonly label: string
  /** For `vazio` the listing path with no query; for `erro` the URL that failed. */
  readonly href: string
}

export interface EmptyStateProps {
  /**
   * Defaults to `'navy'` — the base background every page starts from (FR-011).
   *
   * Not cosmetic, and the reason this prop exists at all: the ink below is declared in a CLASS
   * rule, which beats the `color: var(--text-on-light)` a light page sets on its `<main>`. On
   * `/aulas` and `/biblioteca-3d` that put `--color-claro` (#DCE7E3) on `--surface-inverted`
   * (#FFFFFF) — **1.27:1**, against 16.63:1 for the navy the requirement asks for — so the
   * whole message ("NENHUMA AULA ENCONTRADA.", "NÃO FOI POSSÍVEL CARREGAR AS AULAS.") was
   * invisible while the pink action button beside it was not. `SearchInput` and `Pagination`
   * already took this prop for the same reason; this component was the one that did not, and
   * it was dropped onto both light pages unchanged.
   */
  readonly surface?: EmptyStateSurface
  readonly variant: EmptyStateVariant
  readonly titulo: string
  /** The second line. Optional: the error state of the page spec has none, and an empty
   *  paragraph is a gap the design did not draw. */
  readonly descricao?: string
  readonly acao: EmptyStateAcao
}

/**
 * The ornament per state, from the FR-015 shape vocabulary — no new asset, no second drawing.
 *
 * The wireframe cube is an outlined *empty* box, which is what "no results" is; the double
 * chevron is the vocabulary's "go on / try again" marker, which is what a retry is.
 */
const ORNAMENTO: Record<EmptyStateVariant, IsoShapeName> = {
  vazio: 'cubeWireframe',
  erro: 'doubleChevron',
}

/** Large enough to read as an illustration rather than as an icon beside the heading. */
const ORNAMENTO_SIZE = 'var(--space-11)'

/**
 * The canonical primary button, worn by an anchor.
 *
 * `display` and `text-decoration` are the two properties an `<a>` needs and a `<button>` does
 * not; everything that carries the identity comes from the imported object.
 */
const ACAO_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  display: 'inline-block',
  textDecoration: 'none',
}

/** No media query: the block is centred and reflows at every width by itself (FR-021). */
export const EMPTY_STATE_CSS = `
.${CLASS.state} {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) var(--space-6);
  text-align: center;
  color: var(--color-claro);
  font-family: var(--font-body);
}
.${CLASS.ornamento} {
  color: var(--color-teal);
}
.${CLASS.titulo} {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  text-transform: uppercase;
}
.${CLASS.descricao} {
  margin: 0;
  font-size: var(--text-base);
  max-width: 42ch;
}
.${CLASS.acao} {
  text-transform: uppercase;
  font-family: var(--font-display);
}
/* The light page, where the two colours above are near-invisible. Both replacements are
   pairs DOCUMENTED_PAIRS already scores against 'claro', and white is lighter than 'claro',
   so a pair that passes there passes here: navy ink 16.63:1, the azul ornament 6.15:1. */
.${CLASS.light} {
  color: var(--color-navy);
}
.${CLASS.light} .${CLASS.ornamento} {
  color: var(--color-azul);
}
.${CLASS.acao}:focus-visible {
  /* FR-023 / SC-009 — the 2px ring projetos.md § Estados requires on every interactive target.
     Claro, not the accent: the ring sits ON the accent fill, where pink on pink is invisible. */
  outline: 2px solid var(--color-claro);
  outline-offset: 2px;
}
`

/**
 * The defined empty or error body of a listing, with the one action that resolves it.
 *
 * @example
 * <EmptyState variant="vazio" titulo="Nenhum projeto encontrado."
 *             descricao="Tente outra categoria ou limpe a busca."
 *             acao={{ label: 'Limpar filtros', href: '/projetos' }} />
 */
export function EmptyState({
  variant,
  titulo,
  descricao,
  acao,
  surface = 'navy',
}: EmptyStateProps): ReactElement {
  return (
    <section
      className={surface === 'light' ? `${CLASS.state} ${CLASS.light}` : CLASS.state}
      // A failure is announced; "no results for this filter" is ordinary content and must not
      // be. Giving both the alert role would train a screen-reader user to ignore it.
      role={variant === 'erro' ? 'alert' : undefined}
    >
      {/* Decoration, so no `title`: IsoShape then hides it from assistive technology, and the
          heading below already says what the state is. */}
      <span className={CLASS.ornamento}>
        <IsoShape name={ORNAMENTO[variant]} size={ORNAMENTO_SIZE} />
      </span>
      <h2 className={CLASS.titulo}>{titulo}</h2>
      {descricao === undefined ? null : <p className={CLASS.descricao}>{descricao}</p>}
      <a className={CLASS.acao} href={acao.href} style={ACAO_STYLE}>
        {acao.label}
      </a>
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href. */}
      <style href="fablab-empty-state" precedence="default">
        {EMPTY_STATE_CSS}
      </style>
    </section>
  )
}
