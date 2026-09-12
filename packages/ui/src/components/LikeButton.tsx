'use client'
// The visitor's press has to change the screen without changing the number: it opens the
// account invitation, and open/closed is state a press drives — the one piece of real
// interactivity this control has (FR-025, FR-014). `islands.test.ts` § ALLOWED_ISLANDS already
// carries the entry and the argument for it.

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'

import { LOGIN_HREF } from '../shell/HeaderNav'
import { PRIMARY_BUTTON_STYLE } from './Button'

/**
 * T001 / FR-025, US7 — the heart, in the branch a visitor sees.
 *
 * `projetos.md` § *Deslogado*, decided by the PO on 2026-08-24: *"clicar no coração abre
 * convite ao cadastro"*, with the wording superseded on 2026-08-23 — *"curtidas **não geram
 * XP**, então a microcopy passa a «Crie sua conta para curtir e evoluir como maker»"*. US7
 * adds the half the microcopy cannot state on its own: **the count they saw does not change**.
 *
 * ── Why the visitor's number is the prop and never this component's state ───────────────────
 *
 * The state exists for the signed-in branch, where the server's answer replaces it (FR-026).
 * Reading it in the visitor's branch would look identical in review — both print the same
 * number on first render — and would differ only once something wrote to it, which is exactly
 * what an optimistic bump is. The person it would lie to is the one with no account to record
 * a like against and no way to undo the impression that one happened. So the two branches read
 * two different sources on purpose, and `like-button.test.ts` plants a state the server never
 * sent to prove the visitor's branch ignores it.
 *
 * ── Why the invitation is a panel this control owns, not a page the click navigates to ──────
 *
 * The invitation is the answer to a press on a card in a grid of twelve. Navigating away would
 * lose the visitor's place in the listing to show them one sentence, and returning would put
 * them at the top of the page — the same cost `ProjectCarousel` refuses to pay for one slide.
 *
 * ── Why there is no `aria-controls` ─────────────────────────────────────────────────────────
 *
 * It would need an id, and a listing renders one of these per card: a constant id would be
 * twelve duplicate ids on one page, which is worse for a screen reader than the missing
 * relationship. `useId` would buy the id at the cost of a third hook on an island that is meant
 * to stay the small one (plan § "The `LikeButton` island is small"). `aria-expanded` is valid
 * on its own and carries the part a visitor needs: the press opens something.
 *
 * @example
 *   <CardProjeto {...projeto} curtir={<LikeButton curtidas={projeto.curtidas} />} />
 */

/**
 * The invitation, verbatim from `projetos.md` § *Deslogado*.
 *
 * Exported so a page or a test can name it without retyping it, and a single place to change
 * if the PO changes it again — the previous wording ("…curtir e ganhar XP") was superseded
 * once already, and it survived in three documents for a week afterwards.
 */
export const CONVITE_MICROCOPY = 'Crie sua conta para curtir e evoluir como maker'

/**
 * Step 1 of the sign-up (`onboarding.md`, and the route feature 004 builds at
 * `app/(frontend)/criar-conta`). Exported for the same reason the shell exports `LOGIN_HREF`:
 * the day the route moves, every caller moves with it instead of 404ing independently.
 */
export const CRIAR_CONTA_HREF = '/criar-conta'

/** What the server knows about this person and this row — the shape the signed-in branch
 *  replaces wholesale with the server's answer, rather than patching field by field. */
export interface EstadoCurtida {
  readonly curtidas: number
  readonly curtido: boolean
}

/** Which background this heart sits on: the navy card, or a white content page. */
export type LikeButtonSurface = 'navy' | 'light'

export interface LikeButtonProps {
  /** The count as the server rendered it. For a visitor this is also what stays on screen. */
  readonly curtidas: number
  /**
   * Defaults to `'navy'` — `CardProjeto`'s footer, which is the surface this control was drawn
   * against and where the accent scores 8.12:1.
   *
   * The same prop, for the same reason, as `EmptyState`, `SearchInput` and `Pagination`: on
   * `/aulas` and `/biblioteca-3d` the accent measures about **1.8:1** on the inverted surface,
   * and `biblioteca-3d.md` had already decided the answer before this island existed — *the
   * number is navy and the pink `♥` beside it is marked **(proposta)*** — which is also the
   * only reading FR-028's *"nada de rosa em texto pequeno sobre branco"* allows. That page's own
   * `ESTILO.coracao` carried the navy, and this island replaced the span it was on: without this
   * prop, moving the count into a component silently repaints it pink on white.
   *
   * ── Why the ink is an inline style and not a `--light` class ────────────────────────────────
   *
   * A modifier class would work in a browser and would still ship the accent declaration to the
   * white page, where `aulas-page.test.ts` § 2 scans the **rendered** CSS for exactly that
   * string. That gate is deliberately cascade-blind — it says so itself — so a rule that is
   * correctly overridden and a rule that is applied look identical to it, and the only way to
   * keep it strict is to emit no pink to a light page at all. An inline value is per instance:
   * the white page receives `--text-on-light` and nothing else. `.fl-like` therefore declares
   * `color: inherit`, which a `<button>` does not do on its own.
   *
   * The focus ring is deliberately NOT keyed here: `tokens/focus.css` makes
   * `--focus-ring-color` a property the light pages re-declare beside `--surface-page`, so the
   * ring already follows the region and a second opinion here would be a second bug.
   */
  readonly surface?: LikeButtonSurface
  /** Whether this maker has already liked the row. Meaningless for a visitor, who has no likes. */
  readonly curtido?: boolean
  /**
   * Resolved by the page and passed in — this package never learns who is signed in (FR-018).
   *
   * Defaults to `false`, the branch that writes nothing: a page that forgets to pass it shows
   * the invitation to a signed-in maker, which is a wrong screen. The other default would
   * offer a like control to a visitor whose click cannot be recorded.
   */
  readonly isSignedIn?: boolean
  /** The server action a signed-in press awaits, answering with the state to display (FR-026). */
  readonly onCurtir?: () => Promise<EstadoCurtida>
}

const RAIZ_STYLE: CSSProperties = {
  // The invitation is positioned against this, so the panel hangs off the heart rather than
  // off whichever ancestor happens to be positioned.
  position: 'relative',
  display: 'inline-flex',
  fontFamily: 'var(--font-body)',
}

/**
 * The heart itself: the card's own count row, as a control.
 *
 * It deliberately matches `CARD_PROJETO_CSS`'s `__curtidas` — accent glyph, `--space-1` gap,
 * `--text-sm` — because this island *replaces* that static count in the card's `curtir` slot.
 * A different size or colour would make two cards in one grid disagree depending on whether
 * the page supplied an island for them.
 */
/**
 * A stylesheet, because two of this control's requirements cannot be written as a style object.
 *
 * `:focus-visible` has no inline form — React has no pseudo-class — and FR-023 makes the ring
 * mandatory on every interactive target. `min-width`/`min-height` could be inline, but they
 * belong beside the ring they travel with: 003 § CLR-010 records that until this feature the
 * heart "renders, it is **not a target**", and making it one is this task's job. `artigos.md`
 * § Hover/foco names the coração among the 44x44 targets, and the arrow beside it in the same
 * card footer already carries the rule — a card with one conforming control and one 14px one
 * is worse than either alone.
 */
export const LIKE_BUTTON_CSS = `
.fl-like {
  /* FR-022, written unconditionally rather than under a breakpoint: a target that is only
     large below 834 is a rule nobody can check on the device in their hand. */
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  background: transparent;
  border: none;
  padding: 0;
  /* A button element does not inherit colour on its own. The value comes from the root span,
     keyed by the surface prop — see its docblock for why the ink is not a modifier class.
     No tag syntax and no backtick in this comment: a backtick would end the template literal,
     and React writes a style element's children as RAW text, so a literal tag here would reach
     the document and be matched by tests looking for the real element. */
  color: inherit;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.fl-like:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
/* The backdrop is what takes the dialog OUT of the card.
   Measured on the first draft: the panel was position:absolute under the heart, and every
   pixel of it was clipped away by .fl-card-projeto's own overflow:hidden — which is
   load-bearing there, since it is what stops the cover photo squaring off the rounded
   corners. An absolutely-positioned box is clipped by an overflow ancestor and z-index does
   not escape that clip. The geometry made it total rather than marginal: the footer's 8px
   padding put the panel's top edge exactly on the card's bottom border. A visitor pressed the
   heart and nothing appeared, on all twelve cards, while 12 of 12 tests passed — the suite
   renders no DOM and so can see no layout.
   A fixed box takes its containing block from the viewport, so no ancestor's overflow
   applies and no measurement is needed. */
.fl-like__fundo {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: color-mix(in srgb, var(--color-navy) 72%, transparent);
}
.fl-like__convite {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  max-width: 32ch;
  /* claro on navy — the pair contrast.test.ts scores at body size. */
  background: var(--color-navy);
  color: var(--color-claro);
  border: 1px solid var(--color-claro);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.fl-like__fechar {
  align-self: flex-end;
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: var(--color-claro);
  font-family: var(--font-display);
  cursor: pointer;
}
.fl-like__fechar:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
`

/** The class names the stylesheet declares, in one place so a rename cannot half-happen. */
const CLASSE = {
  coracao: 'fl-like',
  fundo: 'fl-like__fundo',
  convite: 'fl-like__convite',
  fechar: 'fl-like__fechar',
} as const

/**
 * The heart's ink, per surface.
 *
 * Navy pages get the accent, matching `CARD_PROJETO_CSS`'s `__curtidas` so two cards in one
 * grid cannot disagree depending on whether the page supplied an island. The white pages get
 * the ink they already paint their body text with — 16.63:1, against about 1.8:1 for the accent.
 */
const TINTA: Record<LikeButtonSurface, string> = {
  navy: 'var(--color-primary)',
  light: 'var(--text-on-light)',
}

/** The canonical primary, worn by an anchor: this CTA navigates, so it is a link, and a
 *  `<Button>` would be a control that goes nowhere without a handler (home.md § hero). */
const CTA_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  display: 'inline-block',
  textAlign: 'center',
  textDecoration: 'none',
}

const ENTRAR_STYLE: CSSProperties = { color: 'var(--color-claro)' }

interface CoracaoProps {
  readonly rotulo: string
  readonly curtidas: number
  readonly curtido?: boolean
  readonly expandido?: boolean
  readonly onClick: () => void
}

/** The count row, in both branches: one glyph, one number, one accessible sentence. */
function coracao({ rotulo, curtidas, curtido, expandido, onClick }: CoracaoProps): ReactElement {
  return (
    <button
      type="button"
      // Not `submit`: this control sits inside listing markup that may one day be a filter form.
      className={CLASSE.coracao}
      aria-label={rotulo}
      aria-expanded={expandido}
      aria-pressed={curtido}
      onClick={onClick}
    >
      {/* Decoration: announced, "♥" is read as "black heart suit" or skipped entirely, so the
          sentence in `aria-label` is what a screen reader actually gets. */}
      <span aria-hidden={true}>♥</span>
      <span>{curtidas}</span>
    </button>
  )
}

/**
 * The invitation — the microcopy, both doors it opens onto, and a way out of it.
 *
 * `onFechar` is not decoration. The first draft set `convidando` to `true` and had no path
 * back: no close control, no Escape, no toggle, and `aria-expanded` stuck at `true` for the
 * rest of the page's life. On a twelve-card listing every heart pressed left a permanent
 * panel, and a screen-reader user was told "expanded" with nothing able to collapse it.
 * `MenuSheet` — this repo's only other disclosure island — is a toggle *and* carries an
 * in-panel close, which is the convention this now follows.
 */
function convite(onFechar: () => void): ReactElement {
  return (
    <div className={CLASSE.fundo}>
      <div role="dialog" aria-modal={true} aria-label={CONVITE_MICROCOPY} className={CLASSE.convite}>
        <button type="button" className={CLASSE.fechar} aria-label="Fechar convite" onClick={onFechar}>
          ✕
        </button>
        <p>{CONVITE_MICROCOPY}</p>
        <a href={CRIAR_CONTA_HREF} style={CTA_STYLE}>
          CRIAR CONTA
        </a>
        {/* A visitor who already has an account is not being invited to make a second one. */}
        <a href={LOGIN_HREF} style={ENTRAR_STYLE}>
          JÁ TENHO CONTA
        </a>
      </div>
    </div>
  )
}

/**
 * The heart on a card: an invitation for a visitor, a like for a signed-in maker.
 *
 * Both hooks run before the branch, unconditionally — a `useState` inside an `if` is the one
 * way to break the rules of hooks with code that reads correctly.
 */
export function LikeButton({
  curtidas,
  surface = 'navy',
  curtido = false,
  isSignedIn = false,
  onCurtir,
}: LikeButtonProps): ReactElement {
  const [estado, setEstado] = useState<EstadoCurtida>({ curtidas, curtido })
  const [convidando, setConvidando] = useState(false)

  // Escape closes it, which is what `role="dialog"` promises a keyboard user. Registered only
  // while the panel is open, so twelve idle hearts on a listing add no listeners.
  useEffect(() => {
    if (!convidando) return
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setConvidando(false)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [convidando])

  if (!isSignedIn) {
    return (
      <span style={{ ...RAIZ_STYLE, color: TINTA[surface] }}>
        <style href="fablab-like-button" precedence="default">
          {LIKE_BUTTON_CSS}
        </style>
        {coracao({
          // `curtidas`, the prop — never `estado`. See the docblock: this is the whole of
          // "the count they saw does not change".
          rotulo: `${curtidas} curtidas. ${CONVITE_MICROCOPY}`,
          curtidas,
          expandido: convidando,
          // A TOGGLE. `() => setConvidando(true)` was the first draft and it is one-way: the
          // panel could be opened and never closed, by any means.
          onClick: () => setConvidando((aberto) => !aberto),
        })}
        {convidando ? convite(() => setConvidando(false)) : null}
      </span>
    )
  }

  return (
    <span style={{ ...RAIZ_STYLE, color: TINTA[surface] }}>
      <style href="fablab-like-button" precedence="default">
        {LIKE_BUTTON_CSS}
      </style>
      {coracao({
        rotulo: `${estado.curtidas} curtidas. ${estado.curtido ? 'Descurtir' : 'Curtir'}`,
        curtidas: estado.curtidas,
        curtido: estado.curtido,
        onClick: async () => {
          // The server's answer replaces the state; nothing is written before it arrives. An
          // optimistic bump here is what FR-026's "a failed write restores the count" forbids,
          // and the write itself is T028b's `lib/accounts/curtir.ts`.
          if (onCurtir) setEstado(await onCurtir())
        },
      })}
    </span>
  )
}
