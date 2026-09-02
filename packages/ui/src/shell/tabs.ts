/**
 * T027b / FR-008 — the shell's four navigation sets, as data.
 *
 * `concept.md` (designer, 2026-08-23, corrected in rounds 3 and 5) decides all four in one
 * sentence: *"navegação canônica **desktop** em todas as páginas, nesta ordem: `BIBLIOTECA 3D ·
 * PROJETOS · CALENDÁRIO · AULAS · INSTAGRAM · ARTIGOS` … nas versões compactas, `BIBLIOTECA 3D`
 * e `INSTAGRAM` saem da barra e vivem no **menu** … **tablet**: `PROJETOS · CALENDÁRIO · AULAS ·
 * ARTIGOS`; **mobile (barra inferior)**: `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL`"*.
 * `calendario.md` § `HeaderPrincipal` and `home.md` § `MenuDrawer` restate it identically.
 *
 * ── Why this is a plain `.ts` and not part of `HeaderNav.tsx` ───────────────────────────────
 *
 * Mechanical, not stylistic. SC-004/SC-005 are asserted over this *data*, and a test that
 * imports `HeaderNav.tsx` to read it pulls JSX into Vitest's module graph — which this package
 * has no transform for and, under CLR-003, may not add a dependency to get. Keeping the sets in
 * a JSX-free module is what makes the criteria testable at all; it is the same extraction, for
 * the same reason, as `clampScale()` out of `PixelImage` (T026, round 2). Nothing here may
 * import a `.tsx`, not even for a type — `tests/shell-tabs.test.ts` asserts that too.
 *
 * ── Why the sets are composed from shared entries, never re-typed per breakpoint ────────────
 *
 * Four literal arrays would let `PROJETOS` point at `/projetos` in the header and `/projeto` in
 * the menu. Both render, both look right, and only the menu 404s. Each tab is declared once
 * below and the sets are compositions of those declarations, so a destination cannot disagree
 * with itself across breakpoints.
 */

/**
 * One entry in a shell navigation set.
 *
 * Distinct from `components/Tabs`' `TabItem` — that is the *category filter* bar, whose labels
 * are CMS data in natural case. These labels are fixed platform navigation, written in the caps
 * the designer wrote them in.
 */
export interface ShellTab {
  /** The label exactly as the navigation decision writes it, e.g. `BIBLIOTECA 3D`. */
  readonly label: string
  /**
   * Where the tab goes — always a path of this site.
   *
   * Deliberately never an absolute URL: `packages/ui` receives resolved values and knows no
   * organization's own accounts (FR-018). A hardcoded `https://instagram.com/<handle>` here
   * would send every future organization's visitors to Fab Lab CITe's profile and look correct
   * in every screenshot. `INSTAGRAM` therefore points at an app route that redirects to the
   * profile on the organization record, and carries `external` so the shell still opens it the
   * way an off-site link should.
   */
  readonly href: string
  /** True only where the destination leaves this site — `INSTAGRAM` opens in a new tab. */
  readonly external?: boolean
}

const BIBLIOTECA_3D: ShellTab = { label: 'BIBLIOTECA 3D', href: '/biblioteca-3d' }
const PROJETOS: ShellTab = { label: 'PROJETOS', href: '/projetos' }
const CALENDARIO: ShellTab = { label: 'CALENDÁRIO', href: '/calendario' }
const AULAS: ShellTab = { label: 'AULAS', href: '/aulas' }
const INSTAGRAM: ShellTab = { label: 'INSTAGRAM', href: '/instagram', external: true }
const ARTIGOS: ShellTab = { label: 'ARTIGOS', href: '/artigos' }

/**
 * The account entry point of the mobile bottom bar.
 *
 * `/minha-conta` is the signed-in destination. FR-009 (T031) is what redirects a signed-out
 * visitor to the login screen; that decision needs the session and so cannot live in static
 * data — a second `PERFIL` entry pointing at `/login` would put the same choice in two places
 * and let them disagree.
 */
const PERFIL: ShellTab = { label: 'PERFIL', href: '/minha-conta' }

/** Desktop (1440): the canonical six, in order. No menu button exists at this width. */
export const DESKTOP_TABS: readonly ShellTab[] = [
  BIBLIOTECA_3D,
  PROJETOS,
  CALENDARIO,
  AULAS,
  INSTAGRAM,
  ARTIGOS,
]

/**
 * Tablet (834): the desktop order minus the two that move into the menu.
 *
 * A subsequence of `DESKTOP_TABS`, not a re-ordering: round 2's mockup read
 * `PROJETOS · AULAS · CALENDÁRIO · ARTIGOS` and round 3 corrected it "para seguir a do desktop".
 */
export const TABLET_TABS: readonly ShellTab[] = [PROJETOS, CALENDARIO, AULAS, ARTIGOS]

/** Mobile (390): the bottom bar — the tablet four, then `PERFIL` in the fifth position. */
export const MOBILE_TABS: readonly ShellTab[] = [PROJETOS, CALENDARIO, AULAS, ARTIGOS, PERFIL]

/**
 * The compact menu (`MenuSheet`, T030): **all** the tabs, in the canonical desktop order.
 *
 * It is a separate export rather than an alias of `DESKTOP_TABS` because the two answer
 * different questions — one is "the desktop bar", the other is "everywhere a visitor can go
 * from a compact layout". They coincide today; the menu is where a seventh destination would
 * land first, and an alias would silently put it in the desktop bar as well.
 *
 * `BIBLIOTECA 3D` and `INSTAGRAM` live *only* here in the compact layouts (SC-005) — this is
 * the set that keeps them reachable.
 */
export const MENU_TABS: readonly ShellTab[] = [
  BIBLIOTECA_3D,
  PROJETOS,
  CALENDARIO,
  AULAS,
  INSTAGRAM,
  ARTIGOS,
]
