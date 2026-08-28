import type { ReactElement, ReactNode } from 'react'

import { LogoChip } from '../components/LogoChip'
import { DESKTOP_TABS, MOBILE_TABS, TABLET_TABS, type ShellTab } from './tabs'

/**
 * T028 / FR-008, US3 — the header bar, at all three design targets.
 *
 * `concept.md` (designer, 2026-08-23, corrected in rounds 3 and 5) decides three states:
 * *"navegação canônica **desktop** … `BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS ·
 * INSTAGRAM · ARTIGOS`"* with **no menu button**; *"**tablet**: `PROJETOS · CALENDÁRIO ·
 * AULAS · ARTIGOS`"* plus the menu; and on mobile the logo with the menu button top-right,
 * the tabs having moved to the bottom bar (`MobileTabBar`, T029). The sets themselves are
 * `./tabs` — imported, never retyped here, so a rename cannot make the header and the menu
 * disagree about where `PROJETOS` goes.
 *
 * ── Why the union is rendered once and the cascade chooses ──────────────────────────────────
 *
 * The obvious implementation reads the width and returns `DESKTOP_TABS` or `TABLET_TABS`.
 * It is indistinguishable in a screenshot and it costs the entire header a trip across the
 * client boundary — reading a media query is a browser API, so the bar would become an
 * island, with a hydration pass and a first paint at the wrong breakpoint, all to express
 * something the cascade does for free (plan § Sketch 5; FR-014's "a component is a server
 * component unless it has real interactivity"). So every tab is in the markup at every
 * width, the two the compact bars
 * drop carry `fl-header__tab--wide`, and `display` is what differs by breakpoint. The header
 * ships zero JavaScript.
 *
 * ── Why the rules travel as a <style> element and not a stylesheet ──────────────────────────
 *
 * They cannot be a style *object*, which is how every other component in this package carries
 * its identity: an inline style has no media query, and the breakpoint switch is the whole
 * requirement. The two remaining homes are both closed. `src/styles.css` is asserted to be an
 * aggregator of exactly the three token files and nothing else (`tests/styles-entry.test.ts`),
 * and `src/tokens/layout.css` is asserted to declare tokens and style nothing
 * (`tests/layout-tokens.test.ts`) — both deliberately, so that a rule cannot hide where the
 * colour fence exempts the directory. A CSS Module is the third option and the one the plan
 * sketched, but `import './HeaderNav.module.css'` has no type in this package (`tsc` fails
 * TS2307 without a `*.d.ts` this feature does not ship) and CLR-003 forbids adding the
 * tooling that would give it one.
 *
 * A `<style href … precedence>` is React 19's own answer: it is hoisted to `<head>` and
 * deduplicated by `href`, so a header on every page emits one stylesheet, and the rules stay
 * in the file whose markup they paint. It is also what keeps them *testable* — the CSS text
 * is a value in the returned tree, so `tests/header-nav.test.ts` asserts the switching rules
 * themselves rather than that a class name appears in two files.
 *
 * Both halves of FR-002 still reach it: ESLint's `TemplateElement` selector scans this file
 * for hex and for the private raw pink token (whose name is therefore not spelled here, not
 * even in a comment — CLR-001), and the component's own test restates FR-012's
 * design-target rule, which `layout-tokens.test.ts` cannot — that guard walks `.css` files.
 */

/** The class names, in one place: the markup below and `HEADER_NAV_CSS` must agree, and a
 *  typo in either is otherwise an unstyled element or a breakpoint that switches nothing. */
const CLASS = {
  header: 'fl-header',
  nav: 'fl-header__nav',
  tab: 'fl-header__tab',
  /** Only on the tabs the compact bars drop — `BIBLIOTECA 3D` and `INSTAGRAM` (SC-005). */
  wideOnly: 'fl-header__tab--wide',
  menu: 'fl-header__menu',
} as const

/**
 * The bar's three states, mobile-first: 390 is the base, 834 and 1440 are additive.
 *
 * Exported so the workbench (FR-016) and T032 can read the decision without rendering it.
 * Every colour resolves through a token (FR-002) and every width is a design target (FR-012).
 */
export const HEADER_NAV_CSS = `
.${CLASS.header} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-6);
  background: var(--color-navy);
}
.${CLASS.nav} {
  display: none;
  align-items: center;
  gap: var(--space-6);
}
.${CLASS.tab} {
  font-family: var(--font-display);
  font-size: var(--text-base);
  text-transform: uppercase;
  color: var(--color-claro);
  text-decoration: none;
  white-space: nowrap;
}
.${CLASS.wideOnly} {
  display: none;
}
.${CLASS.menu} {
  display: flex;
  align-items: center;
}
@media (min-width: 834px) {
  .${CLASS.nav} {
    display: flex;
  }
}
@media (min-width: 1440px) {
  .${CLASS.wideOnly} {
    display: block;
  }
  .${CLASS.menu} {
    display: none;
  }
}
`

export interface HeaderNavProps {
  /**
   * The compact menu — `MenuSheet` (T030), the shell's one client island.
   *
   * A slot rather than an import: the header is a server component and the menu is the only
   * part of the shell that toggles, so keeping the island at the call site is what stops the
   * boundary from creeping outward. It is hidden at the desktop target by CSS, never by
   * omission — omitting it would put "which width is this?" back into JavaScript.
   */
  readonly menu?: ReactNode
}

/** The tabs the tablet bar keeps, by destination. Membership is derived from `TABLET_TABS`
 *  rather than listed here, so SC-005 has exactly one source. */
const COMPACT_HREFS: ReadonlySet<string> = new Set(TABLET_TABS.map((tab) => tab.href))

/**
 * T031 / FR-009 — the two destinations the shell owns that are not in a tab set.
 *
 * `concept.md` (designer, rounds 3–5) states both in one line: *"logo → Home; `PERFIL`
 * deslogado abre o login"*, and `aulas.md` § `HeaderPrincipal` closes it — *"logado, `PERFIL`
 * abre **Minha Conta**"*.
 *
 * Home is a constant, so it is one. The account entry point is not: it is a branch on whether
 * there is a signed-in maker, and this package never learns that (FR-018 — it receives
 * resolved values). What lives here is therefore the *decision* and not the lookup: a total
 * function from that one boolean to a route, which the call site — the app's shell, and the
 * `PERFIL` position of `MobileTabBar` — asks once it knows the answer.
 *
 * Keeping it here rather than in `tabs.ts` is what stops a second `PERFIL` entry pointing at
 * the login screen from existing: two static entries would put the same choice in two places
 * and let the bottom bar and the menu disagree about it (`tabs.ts` § `PERFIL` says so).
 */

/** Home. The logo goes here from every page and every breakpoint. */
export const HOME_HREF = '/'

/** The signed-out answer — `pages/login.md`, the e-mail-and-password screen that is also where
 *  the header's `ENTRAR` and step 2 of the sign-up both send a visitor. */
export const LOGIN_HREF = '/login'

/**
 * The account position of the mobile bar, taken from the data instead of retyped.
 *
 * It is the one entry `MOBILE_TABS` carries that `TABLET_TABS` does not — the fifth position
 * of `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`. Written out as a literal here it
 * would be the second copy of a route that already exists once, which is the failure `tabs.ts`
 * was extracted to prevent: both copies internally consistent, disagreeing with each other,
 * and only one of the two paths 404ing.
 */
const ACCOUNT_TAB: ShellTab | undefined = MOBILE_TABS.find((tab) => !COMPACT_HREFS.has(tab.href))

/**
 * Where `PERFIL` goes: Minha Conta for a signed-in maker, the login screen for a visitor.
 *
 * Pure and total — the caller resolves the session and passes the answer, so nothing here
 * reaches for a request or the client (FR-014, FR-018).
 *
 * The fallback is deliberately the login screen rather than the account page. If the navigation
 * data ever stops carrying an account position, sending a signed-in maker to login costs them
 * one form they can complete; sending a signed-out visitor to a guarded page is the failure
 * FR-009 exists to prevent, and it is not one they can recover from.
 *
 * @example <a href={profileHref(session !== null)}>PERFIL</a>
 */
export function profileHref(isSignedIn: boolean): string {
  return isSignedIn && ACCOUNT_TAB !== undefined ? ACCOUNT_TAB.href : LOGIN_HREF
}

function renderTab(tab: ShellTab): ReactElement {
  const className = COMPACT_HREFS.has(tab.href) ? CLASS.tab : `${CLASS.tab} ${CLASS.wideOnly}`
  return (
    <a
      key={tab.href}
      href={tab.href}
      className={className}
      // `noopener` is the security half and `noreferrer` the privacy one; without the first,
      // the opened page keeps a handle on this one through `window.opener`.
      {...(tab.external === true ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {tab.label}
    </a>
  )
}

/**
 * The platform header: the logo, the canonical tab set, and a slot for the compact menu.
 *
 * A server component — no state, no handler, no width read anywhere (FR-014). Which tabs are
 * visible is `HEADER_NAV_CSS`, not JavaScript.
 *
 * @example <HeaderNav menu={<MenuSheet />} />
 */
export function HeaderNav({ menu }: HeaderNavProps = {}): ReactElement {
  return (
    <header className={CLASS.header}>
      {/* The logo is left at every width (FR-008) and it goes Home from every page (FR-009).
          `LogoChip` renders a <span> when it is given no destination, and an inert chip is the
          one navigation dead end that would appear on every surface of the platform. */}
      <LogoChip href={HOME_HREF} />
      <nav aria-label="Navegação principal" className={CLASS.nav}>
        {DESKTOP_TABS.map(renderTab)}
      </nav>
      <div className={CLASS.menu}>{menu}</div>
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href, so the header renders on every page for one sheet. */}
      <style href="fablab-header-nav" precedence="default">
        {HEADER_NAV_CSS}
      </style>
    </header>
  )
}
