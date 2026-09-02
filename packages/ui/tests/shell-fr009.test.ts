import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { HOME_HREF, profileHref } from '../src/shell/HeaderNav'
import { MobileTabBar } from '../src/shell/MobileTabBar'

/**
 * FR-009 — asserted on what RENDERS, not on a helper nobody calls.
 *
 * The first delivery of this requirement passed 8/8 while neither half worked. `profileHref`
 * had zero production call sites: `MobileTabBar` rendered the static `tabs.ts` entry
 * `{ label: 'PERFIL', href: '/minha-conta' }` for every visitor, so a signed-out maker tapping
 * PERFIL landed on the guarded account page — precisely the failure the helper's own docstring
 * says it exists to prevent. And `MenuSheet` rendered a bare `<LogoChip />`, which is a
 * `<span>`, so the logo was inert at exactly the compact widths where that sheet IS the header.
 *
 * Both were invisible because the tests asserted the pure function in isolation and never
 * asked whether anything called it. These assertions render the shell and read the markup.
 *
 * The signed-out destination is pinned to the LITERAL route, not to `LOGIN_HREF`. Comparing
 * the function against a constant the same module exports is a tautology: it was measured —
 * changing `LOGIN_HREF` to `'/bananas'` left all eight original tests green. `/login` is the
 * screen `docs/product/pages/login.md` documents and FR-009 names.
 *
 * The tree is walked rather than rendered to markup because `react-dom` is not installed here
 * — React is a *peer* and only `react` is linked, and adding `react-dom` would both add a
 * dependency (Principle 1) and risk the second-React-instance failure `package-exports.test.ts`
 * guards. The element tree is what React renders, so an href found here is an href emitted.
 */

const LOGIN_ROUTE = '/login'
const ACCOUNT_ROUTE = '/minha-conta'

/** Every `href` prop in the element tree, depth-first. */
function hrefs(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(hrefs)
  if (!isValidElement(node)) return []
  const props = node.props as { href?: unknown; children?: ReactNode }
  const here = typeof props.href === 'string' ? [props.href] : []
  return [...here, ...hrefs(props.children)]
}

/** Every string of text in the tree, so a label can be asserted without markup. */
function labels(node: ReactNode): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(labels)
  if (!isValidElement(node)) return []
  return labels((node.props as { children?: ReactNode }).children)
}

describe('FR-009: the logo goes Home and PERFIL follows the session', () => {
  it('sends a signed-OUT visitor from PERFIL to the login screen', () => {
    const tree = MobileTabBar({ isSignedIn: false })
    expect(labels(tree)).toContain('PERFIL')
    expect(hrefs(tree)).toContain(LOGIN_ROUTE)
    expect(hrefs(tree), 'a signed-out visitor must not be sent to the guarded account page')
      .not.toContain(ACCOUNT_ROUTE)
  })

  it('sends a signed-IN maker from PERFIL to Minha Conta', () => {
    const tree = MobileTabBar({ isSignedIn: true })
    expect(hrefs(tree)).toContain(ACCOUNT_ROUTE)
    expect(hrefs(tree)).not.toContain(LOGIN_ROUTE)
  })

  it('flips the rendered destination with the session, not merely the helper', () => {
    // The assertion the original suite could not make: the two renders must differ. A helper
    // returning two strings proves nothing while no element consults it.
    expect(hrefs(MobileTabBar({ isSignedIn: false })))
      .not.toEqual(hrefs(MobileTabBar({ isSignedIn: true })))
  })

  it('defaults to the signed-out destination when no session is passed', () => {
    expect(hrefs(MobileTabBar())).toContain(LOGIN_ROUTE)
  })

  it('pins the signed-out route independently of the module that defines it', () => {
    // Sourced from FR-009 and docs/product/pages/login.md, never from LOGIN_HREF.
    expect(profileHref(false)).toBe(LOGIN_ROUTE)
  })

  it('makes the menu-sheet logo a link Home — a <span> there is a dead end on mobile', () => {
    // WEAKER THAN THE ASSERTIONS ABOVE, and labelled so nobody mistakes it for equal evidence.
    // MenuSheet is the shell's one client island: it calls useState, so invoking it as a plain
    // function throws "Cannot read properties of null (reading 'useState')" — it needs a
    // renderer, and `react-dom` is deliberately absent from this package. So this reads the
    // source for the destination rather than the tree for the href.
    //
    // What it can still catch is the exact defect that shipped: `<LogoChip />` with no href
    // renders a <span>, leaving the only logo a mobile or tablet visitor sees inert. What it
    // cannot catch is the href being wrong at runtime. T040's workbench renders the shell from
    // the public surface and is where that becomes observable.
    const source = readFileSync(fileURLToPath(new URL('../src/shell/MenuSheet.tsx', import.meta.url)), 'utf8')
    expect(source, 'MenuSheet must give its LogoChip a destination').toMatch(/<LogoChip\s+href=/)
    expect(source, 'and it must be the Home route, not a second literal').toContain('HOME_HREF')
    expect(HOME_HREF).toBe('/')
  })
})
