'use client'
// The reason, beside the directive rather than only in the docblock (FR-014, US6, SC-007):
// this component toggles. Opening and closing the sheet is a state change driven by a button
// press — the one piece of real interactivity in the shell — and it is the ONLY one: the
// header bar, the bottom bar and the footer are all server components, and nothing here reads
// a viewport width or a scroll position. Deleting this directive breaks the menu; adding it to
// a sibling costs bundle for something the cascade already does.

import { useState, type ReactElement } from 'react'

import { LogoChip } from '../components/LogoChip'
import { HOME_HREF } from './HeaderNav'
import { MENU_TABS, type ShellTab } from './tabs'

/**
 * T030 / FR-008, US6 — the compact menu, and the shell's only client island.
 *
 * `home.md` § Componentes (`MenuDrawer`, decided round 4 and confirmed in round 5,
 * 2026-08-24, against the art `home-mobile.png`): *"só nas versões compactas (tablet/mobile),
 * botão no topo **à direita** da barra, com o **logo à esquerda** … lista com **todas as
 * abas** (`BIBLIOTECA 3D · PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS`), `INSTAGRAM`
 * como link externo"*. `calendario.md` § Header restates it, and round 4 adds the negative:
 * *"no desktop não há botão de menu"*.
 *
 * This component is therefore where the two destinations the compact bars drop stay reachable.
 * `HeaderNav` and `MobileTabBar` can only assert that `BIBLIOTECA 3D` and `INSTAGRAM` are
 * *absent* (SC-005) — a menu that forgot them satisfies both tests, with both destinations
 * unreachable at 390 and 834. The set comes from `./tabs`, imported and never retyped, so a
 * rename cannot make the menu and the bars disagree about where `PROJETOS` goes.
 *
 * ── Why this file, and only this file, is a client component ────────────────────────────────
 *
 * plan § Sketch 5 draws the boundary in one sentence: *"Only `MenuSheet` toggles, so only
 * `MenuSheet` is a client island"*. Open/closed is genuine state — a visitor's press, with no
 * URL and no server round-trip behind it — which is exactly the interactivity FR-014 asks a
 * `'use client'` to be paid for. Everything else the shell does at a breakpoint is a media
 * query, and expressing a media query in JavaScript is what ships a header to the browser to
 * say something the cascade says for free.
 *
 * The island is kept to *this* boundary: the sheet renders its own markup and nothing else,
 * so the header that slots it in stays a server component. That is why `HeaderNav` takes the
 * menu as a `ReactNode` prop instead of importing it — the client boundary stops at the slot.
 *
 * ── Why the sheet repeats the logo and carries a second button ──────────────────────────────
 *
 * The open sheet covers the viewport, so the bar underneath it — and the logo on its left —
 * is not visible while it is open. Without the row below, the canonical lockup disappears at
 * precisely the moment the visitor is navigating (US4 wants it on every surface), and the
 * only control on screen would be somewhere other than where the visitor just pressed. The
 * row therefore restates the decided arrangement — logo left, button top-right — so the
 * button does not appear to move between the two states.
 *
 * ── Why the tabs stay in the markup while the menu is closed ────────────────────────────────
 *
 * The sheet is concealed with the `hidden` attribute rather than unmounted. `hidden` is a
 * semantic the platform already understands (assistive technology skips the subtree, and
 * in-page find does not match it), the six destinations are in the document for a crawler,
 * and opening the menu is a class-free attribute flip rather than the construction of six
 * links. The trap that comes with it is in `MENU_SHEET_CSS` below.
 *
 * ── Why the rules travel as a <style> element ───────────────────────────────────────────────
 *
 * The same three closed doors as `HeaderNav` and `MobileTabBar` (see their WHY): an inline
 * style object has no media query, `src/styles.css` is asserted to be an aggregator of exactly
 * the three token files and `src/tokens/layout.css` to declare tokens and style nothing, and
 * `import './x.module.css'` has no type in this package — tooling CLR-003 forbids adding.
 * React 19's `<style href … precedence>` is hoisted to `<head>` and deduplicated by `href`,
 * so a menu on every page emits one sheet, and the CSS text stays a value in the returned
 * tree, which is what lets `tests/menu-sheet.test.ts` assert the decisions themselves.
 */

/** The class names, in one place: the markup below and `MENU_SHEET_CSS` must agree, and a typo
 *  in either is otherwise an unstyled element or a sheet that never covers anything. */
const CLASS = {
  root: 'fl-menu',
  button: 'fl-menu__button',
  sheet: 'fl-menu__sheet',
  bar: 'fl-menu__bar',
  nav: 'fl-menu__nav',
  tab: 'fl-menu__tab',
} as const

/**
 * The sheet's id, referenced by every button's `aria-controls`.
 *
 * A module constant rather than a generated one: both buttons must name the *same* sheet, and
 * one menu exists per page — the compact layouts have a single header. A per-instance id would
 * buy nothing and cost the extra hook this island is deliberately without.
 */
const SHEET_ID = 'fl-menu-sheet'

/**
 * The menu's rules, mobile-first: 390 is the base and the desktop target removes the menu.
 *
 * Exported so the workbench (FR-016) can read the decision without rendering it. Every colour
 * resolves through a token (FR-002) and every width is a design target (FR-012).
 */
export const MENU_SHEET_CSS = `
.${CLASS.root} {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.${CLASS.button} {
  font-family: var(--font-display);
  font-size: var(--text-base);
  text-transform: uppercase;
  color: var(--color-claro);
  background: none;
  border: 0;
  padding: var(--space-2);
  cursor: pointer;
}
.${CLASS.sheet} {
  position: fixed;
  inset: 0;
  /* Above MobileTabBar's fixed bar, which sits at 1: a menu that opens *under* the bottom
     bar loses its last two rows to it, at the one width both are on screen together. */
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-6);
  overflow-y: auto;
  background: var(--color-navy);
}
/* The trap of concealing with the attribute: the UA's [hidden] { display: none } is beaten by
   any author class rule, so the rule above would keep the sheet permanently on screen while
   the markup, the tests and assistive technology all agree it is closed. */
.${CLASS.sheet}[hidden] {
  display: none;
}
.${CLASS.bar} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}
.${CLASS.nav} {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.${CLASS.tab} {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  text-transform: uppercase;
  color: var(--color-claro);
  text-decoration: none;
}
@media (min-width: 1440px) {
  .${CLASS.root} {
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
      // the opened page keeps a handle on this one through `window.opener`.
      {...(tab.external === true ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {tab.label}
    </a>
  )
}

/**
 * One of the two controls that flip the sheet — the trigger in the bar, the close inside it.
 *
 * A plain function returning the `<button>`, not a component: as a component the two controls
 * would be a client boundary each, and every assertion about them would have to render one.
 * Both carry the same `aria-expanded`/`aria-controls` pair, because a visitor can reach either
 * one first and the state they announce must be the state of the same sheet.
 */
function renderToggle(label: string, isOpen: boolean, onToggle: () => void): ReactElement {
  return (
    <button
      // Without an explicit type, a button submits the form it happens to be rendered inside.
      type="button"
      className={CLASS.button}
      aria-expanded={isOpen}
      aria-controls={SHEET_ID}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}

/**
 * The compact menu: a button at the right of the bar, and a sheet holding every tab.
 *
 * @example <HeaderNav menu={<MenuSheet />} />
 */
export function MenuSheet(): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  // The updater form, not `setIsOpen(!isOpen)`: two presses landing in one batch would both
  // read the same stale `isOpen` and the second would be a no-op.
  const toggle = (): void => {
    setIsOpen((wasOpen) => !wasOpen)
  }
  return (
    <div className={CLASS.root}>
      {renderToggle('MENU', isOpen, toggle)}
      <div id={SHEET_ID} className={CLASS.sheet} hidden={!isOpen}>
        <div className={CLASS.bar}>
          {/* FR-009's "tapping the logo navigates Home", at the widths where this sheet IS
              the header. Without the href LogoChip renders a <span>, and an inert chip here
              is worse than anywhere else: this is the only logo a mobile or tablet visitor
              ever sees, so the dead end would cover exactly the US3 layouts FR-009 names. */}
          <LogoChip href={HOME_HREF} />
          {renderToggle('FECHAR', isOpen, toggle)}
        </div>
        <nav aria-label="Navegação do menu" className={CLASS.nav}>
          {MENU_TABS.map(renderTab)}
        </nav>
      </div>
      {/* Last, and position-independent: React 19 hoists a precedence-carrying <style> into
          <head> and dedupes it by href, so the menu renders on every page for one sheet. */}
      <style href="fablab-menu-sheet" precedence="default">
        {MENU_SHEET_CSS}
      </style>
    </div>
  )
}
