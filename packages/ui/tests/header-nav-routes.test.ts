import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { LogoChip } from '../src/components/LogoChip'
import { HeaderNav, HOME_HREF, LOGIN_HREF, profileHref } from '../src/shell/HeaderNav'
import { MOBILE_TABS, TABLET_TABS } from '../src/shell/tabs'

/**
 * T031 / FR-009, US3 — where the shell's two session-aware destinations go.
 *
 * FR-009 is two sentences and this file asserts both: *"tapping the logo navigates Home;
 * `PERFIL` opens login when signed out and Minha Conta when signed in"*. `concept.md` § the
 * canonical navigation states it identically (*"logo → Home; `PERFIL` deslogado abre o
 * login"*), and `aulas.md` § `HeaderPrincipal` adds the signed-in half in as many words
 * (*"logado, `PERFIL` abre **Minha Conta**"*).
 *
 * ── Why the PERFIL half is asserted as a function and not as rendered markup ─────────────────
 *
 * The destination depends on the session, and `packages/ui` never reads one (FR-018: the
 * package receives resolved values). So the only thing this layer can own is the *decision* —
 * a total function from "is there a session" to a route — and the only thing worth asserting
 * is that it is a decision at all: that the two answers differ, and that the signed-out one is
 * not the account page. Rendering it proves nothing extra here and would need a DOM that
 * CLR-003 keeps out of this package. It is the same extraction, for the same reason, as
 * `clampScale()` out of `PixelImage` (T026): the arithmetic is testable, the render is not.
 *
 * ── Why the signed-in destination is read out of tabs.ts rather than written here ────────────
 *
 * `/minha-conta` already exists once, as the `PERFIL` entry of `MOBILE_TABS` (T027b). A second
 * copy — in the component, or in this file's expectations — is the "two literal arrays" defect
 * `tabs.ts` was extracted to prevent, in its quietest form: the bottom bar and the resolver
 * would each be internally consistent and disagree with each other, and only one of the two
 * routes would 404. The expectation below therefore *derives* the account destination from the
 * data, and one case asserts the component does not spell it either.
 *
 * ── Why the component is called rather than rendered ────────────────────────────────────────
 *
 * The move `header-nav.test.ts`, `tabs.test.ts` and `logo-chip.test.ts` all make: a React
 * function component is a plain function returning a plain object, so calling it and walking
 * `props.children` asserts the tree it builds without a renderer.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/shell/HeaderNav.tsx', import.meta.url))

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly href?: string
  readonly [key: string]: unknown
}>

function header(): AnyElement {
  return HeaderNav({}) as AnyElement
}

/** Every element in the tree, depth-first. */
function descendants(element: AnyElement): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (!isValidElement(node)) return
    const typed = node as AnyElement
    found.push(typed)
    visit(typed.props.children)
  }
  visit(element.props.children)
  return found
}

/** The one `LogoChip` the bar carries — unrendered, so it is an element of type *function*. */
function logoOf(element: AnyElement): AnyElement {
  const logos = descendants(element).filter((node) => node.type === LogoChip)
  expect(logos, 'the header carries exactly one logo chip').toHaveLength(1)
  return logos[0] as AnyElement
}

/**
 * The account entry point, as `tabs.ts` declares it: the one mobile position the tablet bar
 * does not carry — `PROJETOS · CALENDÁRIO · AULAS · ARTIGOS · PERFIL` minus the tablet four.
 *
 * Derived rather than written, so this file cannot be the place `/minha-conta` drifts.
 */
function accountHrefFromData(): string {
  const compact = new Set(TABLET_TABS.map((tab) => tab.href))
  const account = MOBILE_TABS.filter((tab) => !compact.has(tab.href))
  expect(account, 'the mobile bar must carry exactly one account position').toHaveLength(1)
  return (account[0] as { href: string }).href
}

/** The component's own text, comments stripped — the WHY quotes the routes it must not spell. */
function sourceWithoutComments(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('tapping the logo navigates Home (FR-009)', () => {
  it('gives the logo a destination instead of leaving it inert', () => {
    // `LogoChip` renders a <span> when it gets no href, and a <span> is what a visitor taps
    // for nothing. The chip is the shell's one constant across every page and breakpoint, so
    // an inert one is the commonest navigation dead end the shell can have.
    expect(logoOf(header()).props.href).toBeTypeOf('string')
  })

  it('sends it Home, at the site root', () => {
    expect(logoOf(header()).props.href).toBe(HOME_HREF)
    expect(HOME_HREF).toBe('/')
  })
})

describe('PERFIL resolves against the session (FR-009)', () => {
  it('opens Minha Conta when signed in — the destination tabs.ts already declares', () => {
    expect(profileHref(true)).toBe(accountHrefFromData())
  })

  it('opens the login screen when signed out', () => {
    expect(profileHref(false)).toBe(LOGIN_HREF)
    expect(LOGIN_HREF).toMatch(/^\/[^/]/)
  })

  it('never sends a signed-out visitor to the account page', () => {
    // The whole of FR-009's second sentence: a resolver that returns one route for both
    // answers satisfies every other case in this block and delivers none of the requirement.
    expect(profileHref(false)).not.toBe(accountHrefFromData())
    expect(profileHref(false)).not.toBe(profileHref(true))
  })

  it('answers with a path of this site for either session state', () => {
    for (const isSignedIn of [true, false]) {
      const href = profileHref(isSignedIn)
      expect(href, `profileHref(${String(isSignedIn)}) must be a path of this site`).toMatch(/^\//)
    }
  })
})

describe('the decision stays in one place, and out of the session (FR-018, FR-014)', () => {
  it('takes the account destination from tabs.ts instead of retyping it', () => {
    expect(sourceWithoutComments()).not.toContain(accountHrefFromData())
    expect(sourceWithoutComments()).toMatch(/from\s+'\.\/tabs'/)
  })

  it('reads no session anywhere — the caller resolves it and passes the answer', () => {
    // FR-018 keeps this package free of Next server APIs and IO; each of these would also drag
    // the header across the client boundary or into the request, for a decision that is a
    // branch on a boolean.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    for (const forbidden of ['use client', 'cookies', 'headers(', 'localStorage', 'document.']) {
      expect(source, `HeaderNav must not read the session: found ${forbidden}`).not.toContain(
        forbidden,
      )
    }
  })
})
