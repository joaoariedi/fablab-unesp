import type { ReactElement } from 'react'

import { profileHref } from './HeaderNav'

/** Where the account position points in the data — `profileHref(true)` resolves to it. */
const ACCOUNT_HREF = profileHref(true)
import { MOBILE_TABS, type ShellTab } from './tabs'

/**
 * T029 / FR-008, US3 — the mobile bottom bar, at the 390 target only.
 *
 * `concept.md` (designer, 2026-08-23, corrected in rounds 3 and 5) decides the set —
 * *"**mobile (barra inferior)**: `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`"* — and
 * US3 decides its behaviour: a *"five-position bottom bar (`… · PERFIL`) that **appears on
 * scroll**"*. The set itself is `./tabs`, imported and never retyped, so a rename cannot make
 * the bottom bar and the header disagree about where `PROJETOS` goes.
 *
 * ── Why "appears on scroll" ships zero JavaScript ───────────────────────────────────────────
 *
 * The obvious implementation is a scroll listener: the file opts into the client, holds a
 * state hook, and toggles a class from the window's scroll offset. It is indistinguishable in
 * a screenshot and it makes this the shell's *second* client island — which plan § Sketch 5
 * forecloses in as many words ("Only `MenuSheet` toggles, so only `MenuSheet` is a client
 * island") and which SC-007's audit reads as JavaScript shipped without stated interactivity.
 * Worse, a listener on `scroll` runs on the main thread at frame rate, on exactly the class of
 * device this bar exists for. (The names of those APIs are deliberately not spelled anywhere in
 * this file: its own test greps the raw source for them, comments included.)
 *
 * A **scroll-driven animation** expresses the same reveal in the cascade: the bar's keyframes
 * run against `scroll()` rather than against time, so its position *is* the scroll offset, off
 * the main thread and with no hydration. Where `animation-timeline` is unsupported the
 * declaration is dropped and the animation falls back to the document timeline — which is why
 * the fill mode is `both`: the bar settles on the revealed frame instead of staying translated
 * off-screen. Degrading to "always visible" is correct; degrading to "unreachable navigation"
 * is not, and that is the one failure mode this component cannot have.
 *
 * ── Why the rules travel as a <style> element ───────────────────────────────────────────────
 *
 * The same three closed doors as `HeaderNav` (see its WHY): an inline style object has no
 * media query and no keyframes; `src/styles.css` is asserted to be an aggregator of exactly
 * the three token files (`tests/styles-entry.test.ts`) and `src/tokens/layout.css` to declare
 * tokens and style nothing (`tests/layout-tokens.test.ts`); and `import './x.module.css'` has
 * no type in this package, which CLR-003 forbids adding the tooling to give it. React 19's
 * `<style href … precedence>` is hoisted to `<head>` and deduplicated by `href`, so a bar on
 * every page emits one sheet — and the CSS text stays a value in the returned tree, which is
 * what lets `tests/mobile-tab-bar.test.ts` assert the reveal itself rather than that a class
 * name appears in two files.
 */

/** The class names, in one place: the markup below and `MOBILE_TAB_BAR_CSS` must agree, and a
 *  typo in either is otherwise an unstyled element or a reveal that animates nothing. */
const CLASS = {
  bar: 'fl-tabbar',
  tab: 'fl-tabbar__tab',
} as const

/** The keyframe list the scroll timeline drives. Named, not anonymous, because the fallback
 *  path above depends on it running at all when `animation-timeline` is dropped. */
const REVEAL = 'fl-tabbar-reveal'

/**
 * The bar's rules, mobile-first: 390 is the base, and the tablet target removes it.
 *
 * Exported so the workbench (FR-016) and T032 can read the decision without rendering it.
 * Every colour resolves through a token (FR-002) and every width is a design target (FR-012);
 * the scroll distance over which the bar arrives is a spacing token for the same reason.
 */
export const MOBILE_TAB_BAR_CSS = `
@keyframes ${REVEAL} {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.${CLASS.bar} {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-navy);
  animation: ${REVEAL} linear both;
  animation-timeline: scroll(root block);
  animation-range: 0 var(--space-11);
}
.${CLASS.tab} {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  text-transform: uppercase;
  color: var(--color-claro);
  text-decoration: none;
  white-space: nowrap;
}
@media (min-width: 834px) {
  .${CLASS.bar} {
    display: none;
  }
}
`

function renderTab(tab: ShellTab): ReactElement {
  return (
    <a
      key={tab.href}
      href={tab.href}
      className={CLASS.tab}
      // `noopener` is the security half and `noreferrer` the privacy one; without the first,
      // the opened page keeps a handle on this one through `window.opener`. No mobile tab is
      // off-site today — the flag lives in the data, so it stays honoured if one becomes so.
      {...(tab.external === true ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {tab.label}
    </a>
  )
}

export interface MobileTabBarProps {
  /** Whether a maker is signed in. The caller resolves the session; this stays pure (FR-018). */
  readonly isSignedIn?: boolean
}

/**
 * The mobile bottom bar: five positions ending `PERFIL`, revealed as the page scrolls.
 *
 * A server component — no state, no handler, no scroll position read anywhere (FR-014). When
 * it is visible is `MOBILE_TAB_BAR_CSS`, not JavaScript.
 *
 * `PERFIL` resolves through `profileHref` rather than rendering the static `tabs.ts` href.
 * That entry points at Minha Conta, which is guarded, so shipping it unconditionally sent a
 * signed-out visitor to the page FR-009 exists to keep them off — and this bar is the only
 * place PERFIL renders anywhere in the product.
 *
 * @example <MobileTabBar isSignedIn={session !== null} />
 */
export function MobileTabBar({ isSignedIn = false }: MobileTabBarProps = {}): ReactElement {
  const account = profileHref(isSignedIn)
  return (
    <nav aria-label="Navegação inferior" className={CLASS.bar}>
      {/* The account position is found by its DESTINATION, not by matching the label
          'PERFIL'. A literal here would be the second copy of a string tabs.ts owns — the
          drift `mobile-tab-bar.test.ts` guards against, and it caught exactly that. */}
      {MOBILE_TABS.map((tab) =>
        tab.href === ACCOUNT_HREF ? renderTab({ ...tab, href: account }) : renderTab(tab),
      )}
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href, so the bar renders on every page for one sheet. */}
      <style href="fablab-mobile-tab-bar" precedence="default">
        {MOBILE_TAB_BAR_CSS}
      </style>
    </nav>
  )
}
