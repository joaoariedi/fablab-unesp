import type { CSSProperties, ReactNode } from 'react'

/**
 * T019 / FR-006 — the canonical primary button.
 *
 * `visual-identity.md` § Botões, decided 2026-08-23 and confirmed in round 5 (2026-08-24):
 * **rosa preenchido, texto navy, sombra dura deslocada** — the hero-v2 style. Two renderings
 * are explicitly superseded and deliberately have no home here: the v1 navy fill with a pink
 * outline, and the navy form button of the criar-conta step-2 mockup. Form buttons (login,
 * criar conta) use this same canonical primary; there is no separate form variant to reach for.
 *
 * ── Why there is no `variant` prop ──────────────────────────────────────────────────────────
 *
 * The secondary button — outline claro on navy, outline navy on white — is still marked
 * **(proposta)** in the identity document, and FR-006 pins only the primary. Shipping it now
 * would put an undecided design behind a decided component's API, where the way it gets fixed
 * later is a breaking change to every call site. When it is decided it arrives as a prop with
 * `primary` as the default, and nothing written against this signature changes.
 *
 * ── Why the identity is a style object and not a CSS module ─────────────────────────────────
 *
 * The three values below ARE the requirement, so the test has to read them. CLR-003 keeps this
 * package's test stack at `node` with no DOM, so a class name would be assertable only as file
 * text — a check that a string appears in two files, which stays green when the rule behind it
 * is wrong. As a style object the component is a plain function returning a plain object, and
 * `tests/button.test.ts` reads the decision itself. The same trade the plan made for
 * `clampScale()`: put the decision where a test with no renderer can reach it.
 *
 * Every value resolves through a token: FR-002 allows no colour literal outside
 * `src/tokens/`, and the fill is `--color-primary` rather than the private raw default behind
 * it, which is what makes it follow an organization's theme (CLR-001). The two are the same
 * colour for CITe, so nothing but the token name catches that mistake — which is also why the
 * private one is not spelled anywhere in this file, not even in a comment.
 */

export interface ButtonProps {
  /** The label. Display copy is set in caps by the caller, as the mockups render it. */
  readonly children: ReactNode
  /**
   * Defaults to `'button'`, not to the HTML default of `'submit'`: inside a form, every
   * button that has not opted in would otherwise submit it. Login and criar-conta pass
   * `'submit'` explicitly.
   */
  readonly type?: 'button' | 'submit' | 'reset'
  readonly disabled?: boolean
}

/**
 * The canonical primary identity (FR-006), exported so the workbench (FR-016) and any future
 * variant can be read against it rather than restating it.
 */
export const PRIMARY_BUTTON_STYLE: CSSProperties = {
  // The per-organization accent, never the private raw default it falls back to: the two
  // render identically for CITe and diverge only once a second organization exists (CLR-001).
  background: 'var(--color-primary)',
  color: 'var(--color-navy)',
  // The token, not `4px 4px 0 …` inline: a second definition is free to drift soft, and
  // `--shadow-hard`'s 0 blur is the whole point of the name.
  boxShadow: 'var(--shadow-hard)',
  // No border at all — the v1 mockup's pink contour belongs to the discarded navy variant.
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-6)',
  // Buttons do not inherit the page font in any browser; without this the one element the
  // design leans on hardest falls back to the UA font.
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  cursor: 'pointer',
}

/**
 * The primary call to action: pink fill, navy label, hard offset shadow.
 *
 * A server component — it holds no state and takes no handler, so nothing about it needs the
 * client (FR-014). Interaction that needs JavaScript belongs in the island that owns it.
 *
 * @example <Button type="submit">CRIAR CONTA</Button>
 */
export function Button({ children, type = 'button', disabled }: ButtonProps) {
  return (
    <button type={type} disabled={disabled} style={PRIMARY_BUTTON_STYLE}>
      {children}
    </button>
  )
}
