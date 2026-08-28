/**
 * The responsive shell's public surface (FR-008, FR-009).
 *
 * A component the app cannot import is not delivered, however green its own suite is — five
 * components shipped in exactly that state before `component-barrel.test.ts` started deriving
 * this from the directory. The shell had no barrel at all, so the whole of it was unreachable.
 */
export { Footer } from './Footer'
export { HeaderNav, HOME_HREF, LOGIN_HREF, profileHref } from './HeaderNav'
export { MenuSheet } from './MenuSheet'
export { MobileTabBar } from './MobileTabBar'
export type { MobileTabBarProps } from './MobileTabBar'
export { DESKTOP_TABS, MENU_TABS, MOBILE_TABS, TABLET_TABS, type ShellTab } from './tabs'
