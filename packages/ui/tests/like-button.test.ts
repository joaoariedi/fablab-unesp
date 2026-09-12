import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import {
  LIKE_BUTTON_CSS,
  LikeButton,
  type EstadoCurtida,
  type LikeButtonSurface,
} from '../src/components/LikeButton'
import { LOGIN_HREF } from '../src/shell/HeaderNav'

/**
 * T001 / FR-025, US7 — the heart a visitor clicks, and the number that does not move.
 *
 * US7: *"they get the invitation with the microcopy the page specs fixed — «Crie sua conta
 * para curtir e evoluir como maker» — and **the count they saw does not change**"*. Feature
 * 003 shipped the count on every card and deferred the click (003 § "the heart's click moves
 * to 004"), so this file is where the deferred half is first held to something.
 *
 * ── Why the microcopy is spelled out here rather than imported ───────────────────────────────
 *
 * The sentence is the requirement. Asserting `text === CONVITE_MICROCOPY` against the
 * component's own export would pass for *any* sentence the component happens to hold — the
 * test would be checking that a constant equals itself. `projetos.md` § *Deslogado* records
 * the exact wording and the round that superseded the previous one (*"curtidas **não geram
 * XP**, então a microcopy passa a …"*), so the literal below is the one thing in this file
 * that must be copied from the product doc and never from the source.
 *
 * ── Why a stale state is planted instead of trusting the source ──────────────────────────────
 *
 * "The count does not move" is a claim about a branch, and a component that reads its own
 * state for the visitor's number looks identical in review to one that reads the prop: both
 * print 32 on first render. The difference only shows once the state disagrees with the
 * server, which is exactly what an optimistic bump would create. So the visitor's tree is
 * built with the component's state forced to a number the server never sent — and the screen
 * must still show the server's.
 *
 * ── Why the hook dispatcher is faked rather than the component rendered ──────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM and adds no test renderer, so calling the
 * component and walking `props.children` is the only instrument available — and it stops
 * working the moment a component holds state, because `useState` resolves through React's
 * current dispatcher, which is null outside a renderer. `menu-sheet.test.ts` established the
 * fake for the shell's one island; this one differs in a single way: it resolves each hook by
 * the shape of its **initial value** rather than by call order, so a reordering of two
 * `useState` calls inside the component cannot silently hand a test the wrong hook.
 *
 * What none of this can prove: that React re-renders on the update, or that the invitation is
 * visible over the card. Those are browser questions — feature 003's Playwright, and the
 * page-level test T004 owns.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/LikeButton.tsx', import.meta.url))

/** Copied from `docs/product/pages/projetos.md` § *Deslogado* — never from the component. */
const MICROCOPY = 'Crie sua conta para curtir e evoluir como maker'

/** The count the "server" gave. Any number works; a distinctive one makes a failure readable. */
const CURTIDAS = 32

/** A number the server never sent, planted in the component's own state. */
const NUNCA_ENVIADO = 999

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** Where React 19 keeps the hook dispatcher the fake below stands in for. Read defensively:
 *  if an upgrade moves it, `mount()` fails with that sentence rather than a null dereference. */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

/** How a test bends one hook: given what the component asked for, return what it gets back. */
type Estados = (initial: unknown) => unknown

/**
 * The two hooks this island is allowed, with their state chosen by the test.
 *
 * A named fake rather than an inline literal: it records every update the component pushes,
 * which is what makes "the click opens the invitation" and "nothing writes the count" into
 * executed behaviour instead of the word `setState` appearing in the file. A component
 * reaching for a *third* kind of hook fails loudly here ("dispatcher.useEffect is not a
 * function") rather than quietly becoming a bigger island than SC-012 allows.
 */
class FakeHookDispatcher {
  /** Every value passed to a setter, in call order — a value or an updater function. */
  readonly updates: unknown[] = []

  constructor(private readonly estados: Estados) {}

  /** Effects are RECORDED, and `runEffects` is what turns a recording into evidence: an
   *  effect nobody invokes can have its guard deleted with every test still green. */
  readonly effects: (() => void | (() => void))[] = []

  readonly useState = (initial: unknown): [unknown, (next: unknown) => void] => [
    this.estados(initial),
    (next: unknown): void => {
      this.updates.push(next)
    },
  ]

  readonly useEffect = (effect: () => void | (() => void)): void => {
    this.effects.push(effect)
  }
}

/** Run every recorded effect, returning each cleanup. */
const runEffects = (dispatcher: FakeHookDispatcher): (void | (() => void))[] =>
  dispatcher.effects.map((effect) => effect())

/** A `document` with only the two methods the Escape effect uses, recording what it was asked.
 *  The suite has no DOM (CLR-003 of feature 001), so the effect is handed one. */
class FakeDocument {
  readonly added: { type: string; listener: (event: { key: string }) => void }[] = []
  readonly removed: { type: string }[] = []
  readonly addEventListener = (type: string, listener: (event: { key: string }) => void): void => {
    this.added.push({ type, listener })
  }
  readonly removeEventListener = (type: string): void => {
    this.removed.push({ type })
  }
}

/** Installs a fake `document` for the duration of one call, and always restores it. */
function comDocumento<T>(fake: FakeDocument, body: () => T): T {
  const global_ = globalThis as { document?: unknown }
  const anterior = global_.document
  global_.document = fake
  try {
    return body()
  } finally {
    global_.document = anterior
  }
}

interface Mounted {
  readonly tree: AnyElement
  readonly dispatcher: FakeHookDispatcher
}

/** Every hook keeps whatever it asked for — the tree a first render produces. */
const COMO_PEDIDO: Estados = (initial) => initial

/** The invitation, open: the only boolean state this island holds is the one it opens with. */
const CONVITE_ABERTO: Estados = (initial) => (typeof initial === 'boolean' ? true : initial)

/** A like-state the server never confirmed, for the branch that must ignore it. */
const ESTADO_ADULTERADO: Estados = (initial) =>
  typeof initial === 'object' && initial !== null
    ? { curtidas: NUNCA_ENVIADO, curtido: true }
    : initial

interface Props {
  readonly curtidas: number
  readonly surface?: LikeButtonSurface
  readonly curtido?: boolean
  readonly isSignedIn?: boolean
  readonly onCurtir?: () => Promise<EstadoCurtida>
}

/** The component's tree with its hooks answered by `estados`. The dispatcher is restored even
 *  on failure — leaking a fake would break every later file in the run. */
function mount(props: Props, estados: Estados = COMO_PEDIDO): Mounted {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf(
    'object',
  )
  const shared = internals as { H: unknown }
  const dispatcher = new FakeHookDispatcher(estados)
  const previous = shared.H
  shared.H = dispatcher
  try {
    return { tree: LikeButton(props) as AnyElement, dispatcher }
  } finally {
    shared.H = previous
  }
}

/** Every element in the tree, depth-first, the root included. */
function elementsOf(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elementsOf(child as ReactNode))
  if (!isValidElement(node)) return []
  const element = node as AnyElement
  return [element, ...elementsOf(element.props.children)]
}

/**
 * The text the screen shows — string and number children only.
 *
 * Deliberately blind to props: an `aria-label` carrying the microcopy would otherwise make
 * "the invitation is not on screen yet" pass while the sentence is announced, and the closed
 * and open branches would be indistinguishable to every assertion below.
 */
function textOf(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap((child) => textOf(child as ReactNode))
  if (typeof node === 'string') return [node]
  if (typeof node === 'number') return [String(node)]
  if (!isValidElement(node)) return []
  return textOf((node as AnyElement).props.children)
}

/**
 * The **heart**, which is the first `<button>` in the tree.
 *
 * It used to assert there was exactly one, and that was right until the invitation grew a close
 * control. The count is not the property worth pinning — what matters is that this helper
 * returns the heart and not something else — so it takes the first and asserts the tree has
 * one at all. A dialog with no way out was the defect; a test that forbids the way out would
 * have been the next one.
 */
function buttonOf(tree: AnyElement): AnyElement {
  const buttons = elementsOf(tree).filter((element) => element.type === 'button')
  expect(buttons.length, 'the control renders no <button> at all').toBeGreaterThan(0)
  return buttons[0] as AnyElement
}

/** The number the heart prints, read off the screen rather than off the props. */
function countOf(tree: AnyElement): number {
  const numbers = textOf(buttonOf(tree)).filter((text) => /^\d+$/.test(text))
  expect(
    numbers,
    'the heart must print exactly one number — the count. None found means this walk is ' +
      'blind, and every "the count did not move" assertion below would pass vacuously.',
  ).toHaveLength(1)
  return Number(numbers[0])
}

function hrefsOf(tree: AnyElement): string[] {
  return elementsOf(tree)
    .filter((element) => element.type === 'a')
    .map((element) => String(element.props.href))
}

/** Resolve one recorded update against the state it was pushed from. */
function applied(update: unknown, from: unknown): unknown {
  return typeof update === 'function' ? (update as (prev: unknown) => unknown)(from) : update
}

/**
 * The server action a signed-in click awaits, as a named fake.
 *
 * It counts its calls, so "the click asked the server" is observable, and it answers with a
 * count of its own choosing — which is how the optimistic-increment failure gets caught: an
 * implementation that adds one locally would push 33 whatever this fake returns.
 */
class FakeCurtirServer {
  calls = 0

  constructor(private readonly resposta: EstadoCurtida) {}

  readonly curtir = async (): Promise<EstadoCurtida> => {
    this.calls += 1
    return this.resposta
  }
}

describe('LikeButton — the invitation a visitor gets (FR-025, US7)', () => {
  it('shows no invitation until the visitor asks for one', () => {
    const { tree } = mount({ curtidas: CURTIDAS })
    expect(
      textOf(tree),
      'the invitation is the answer to a click. Rendered up front it is an advert on every ' +
        'card of every listing.',
    ).not.toContain(MICROCOPY)
    expect(buttonOf(tree).props['aria-expanded']).toBe(false)
  })

  it('says exactly what the page specs fixed, once opened', () => {
    const { tree } = mount({ curtidas: CURTIDAS }, CONVITE_ABERTO)
    expect(
      textOf(tree),
      'projetos.md § Deslogado fixes the wording, and round 2026-08-23 superseded the previous ' +
        'one because likes do not grant XP. A paraphrase re-opens a decision the PO closed.',
    ).toContain(MICROCOPY)
  })

  it('opens on the press — executed, not the word setState appearing in the file', () => {
    const { tree, dispatcher } = mount({ curtidas: CURTIDAS })
    const onClick = buttonOf(tree).props.onClick as () => void
    expect(onClick, 'the heart must carry a handler; without one the click does nothing').toBeTypeOf(
      'function',
    )
    onClick()
    expect(dispatcher.updates, 'exactly one state write: the invitation opening').toHaveLength(1)
    expect(applied(dispatcher.updates[0], false)).toBe(true)
  })

  it('offers both ways in — the account it invites to, and the one a returning maker has', () => {
    const hrefs = hrefsOf(mount({ curtidas: CURTIDAS }, CONVITE_ABERTO).tree)
    expect(hrefs).toContain('/criar-conta')
    // The shell's own constant, never a second copy of the route (HeaderNav § LOGIN_HREF).
    expect(hrefs).toContain(LOGIN_HREF)
  })

  it('names the count and the invitation in the accessible name', () => {
    const rotulo = String(buttonOf(mount({ curtidas: CURTIDAS }).tree).props['aria-label'])
    // "♥ 32" announced alone is "black heart suit, 32" — a number with no noun, and no hint
    // that pressing it leads to a sign-up rather than to a like.
    expect(rotulo).toContain(String(CURTIDAS))
    expect(rotulo).toContain(MICROCOPY)
  })
})

describe('LikeButton — the invitation can be left, and is not clipped away (FR-025, US7)', () => {
  it('escapes the card that clips it — the panel is fixed, not absolute', () => {
    // ── The defect this closes, and why 12 green tests could not see it ────────────────────
    //
    // The first draft positioned the panel `absolute; top: 100%` under the heart. `CardProjeto`
    // renders the `curtir` slot inside `.fl-card-projeto`, whose `overflow: hidden` is
    // load-bearing — it is what stops the cover photo squaring off the rounded corners. An
    // absolutely-positioned box is clipped by an overflow ancestor, and `z-index` does not
    // escape that clip. The geometry made it total: the footer's 8px padding put the panel's
    // top edge exactly on the card's bottom border, so EVERY pixel fell outside.
    //
    // A visitor pressed the heart on /projetos and nothing appeared, on all twelve cards,
    // while this file was 12 of 12 — it renders no DOM, so it can see no layout. Asserted on
    // the stylesheet, which is the one artefact a DOM-less suite can read.
    const regra = /\.fl-like__fundo\s*\{([^}]*)\}/.exec(LIKE_BUTTON_CSS)?.[1] ?? ''
    expect(regra, 'no rule positions the invitation at all').not.toBe('')
    expect(
      regra,
      'the invitation is not `position: fixed`. Anything else takes its containing block from ' +
        'an ancestor, and the nearest one clips — which is how the first draft rendered a ' +
        'panel no visitor could see while every test passed.',
    ).toMatch(/position:\s*fixed/)
    expect(LIKE_BUTTON_CSS, 'a positioned panel reintroduces the clip').not.toMatch(
      /\.fl-like__fundo\s*\{[^}]*position:\s*absolute/,
    )
  })

  it('closes on a second press — the heart is a toggle, not a one-way switch', () => {
    const { dispatcher, tree } = mount({ curtidas: 42 }, CONVITE_ABERTO)
    const onClick = buttonOf(tree).props.onClick as () => void
    onClick()

    // The first draft was `() => setConvidando(true)`: pressing an open panel re-wrote `true`
    // and nothing could close it. An updater that inverts is the difference.
    const escrita = dispatcher.updates.at(-1)
    expect(typeof escrita, 'the press wrote a literal, so it cannot toggle').toBe('function')
    expect(
      (escrita as (aberto: boolean) => boolean)(true),
      'pressing an OPEN invitation must close it',
    ).toBe(false)
  })

  it('offers a close control inside the panel, the way MenuSheet does', () => {
    const { tree } = mount({ curtidas: 42 }, CONVITE_ABERTO)
    const fechar = elementsOf(tree).filter(
      (element) => element.type === 'button' && String(element.props['aria-label'] ?? '').includes('Fechar'),
    )

    expect(fechar, 'the invitation has no close control').toHaveLength(1)
    expect(typeof fechar[0]?.props.onClick).toBe('function')
  })

  it('closes on Escape, which is what role="dialog" promises a keyboard user', () => {
    const documento = new FakeDocument()
    const { dispatcher } = comDocumento(documento, () => {
      const mounted = mount({ curtidas: 42 }, CONVITE_ABERTO)
      runEffects(mounted.dispatcher)
      return mounted
    })

    expect(documento.added.map((entry) => entry.type)).toEqual(['keydown'])
    documento.added[0]?.listener({ key: 'Escape' })
    expect(dispatcher.updates.at(-1), 'Escape did not close the invitation').toBe(false)
  })

  it('registers no listener while the invitation is shut', () => {
    // Twelve idle hearts on a listing must not add twelve document listeners.
    const documento = new FakeDocument()
    comDocumento(documento, () => runEffects(mount({ curtidas: 42 }).dispatcher))
    expect(documento.added).toEqual([])
  })

  it('removes the listener on cleanup', () => {
    const documento = new FakeDocument()
    comDocumento(documento, () => {
      const mounted = mount({ curtidas: 42 }, CONVITE_ABERTO)
      for (const cleanup of runEffects(mounted.dispatcher)) (cleanup as (() => void) | void)?.()
    })
    expect(documento.removed.map((entry) => entry.type)).toEqual(['keydown'])
  })

  it('makes the heart a target for the first time — 44x44 with a focus ring', () => {
    // 003 § CLR-010 records that until this feature the heart "renders, it is not a target".
    // `artigos.md` § Hover/foco names the coração among the 44x44 targets, and the arrow beside
    // it in the same card footer already carries the rule — one conforming control and one
    // 14px one in the same footer is worse than either alone.
    const heart = /\.fl-like\s*\{([^}]*)\}/.exec(LIKE_BUTTON_CSS)?.[1] ?? ''
    expect(heart).toMatch(/min-width:\s*44px/)
    expect(heart).toMatch(/min-height:\s*44px/)
    // FR-023. An inline style cannot express `:focus-visible` at all, which is why this
    // component carries a stylesheet rather than a style object.
    expect(LIKE_BUTTON_CSS, 'the heart has no focus ring').toMatch(
      /\.fl-like:focus-visible\s*\{[^}]*outline:/,
    )
    expect(LIKE_BUTTON_CSS, 'the close control has no focus ring').toMatch(
      /\.fl-like__fechar:focus-visible\s*\{[^}]*outline:/,
    )
  })
})

describe('LikeButton — the count a visitor sees does not move (FR-025)', () => {
  it('prints the count the server gave, before and after the click', () => {
    expect(countOf(mount({ curtidas: CURTIDAS }).tree)).toBe(CURTIDAS)
    expect(countOf(mount({ curtidas: CURTIDAS }, CONVITE_ABERTO).tree)).toBe(CURTIDAS)
  })

  it('shows the server’s number even when its own state says otherwise', () => {
    // The whole of "the count does not move", in the only form a static tree can prove it: a
    // visitor's branch that reads component state is one bump away from telling the one person
    // who cannot undo it that their like was recorded.
    const { tree } = mount({ curtidas: CURTIDAS }, ESTADO_ADULTERADO)
    expect(
      countOf(tree),
      `the visitor's count must come from the prop the server rendered (${CURTIDAS}), not from ` +
        `component state (${NUNCA_ENVIADO})`,
    ).toBe(CURTIDAS)
  })

  it('writes nothing that could carry a count when a visitor presses it', () => {
    const { tree, dispatcher } = mount({ curtidas: CURTIDAS })
    ;(buttonOf(tree).props.onClick as () => void)()
    for (const update of dispatcher.updates) {
      const value = applied(update, { curtidas: CURTIDAS, curtido: false })
      expect(
        typeof value === 'object' && value !== null && 'curtidas' in value,
        'a visitor’s press may open the invitation and nothing else. An update carrying a ' +
          'count is an optimistic like for someone who has no account to record it against.',
      ).toBe(false)
      expect(typeof value).not.toBe('number')
    }
  })
})

describe('LikeButton — the signed-in branch takes the count from the server (FR-026)', () => {
  it('shows the like-state the server last confirmed, which is what may move', () => {
    const { tree } = mount({ curtidas: CURTIDAS, isSignedIn: true }, ESTADO_ADULTERADO)
    expect(
      countOf(tree),
      'the signed-in branch is the one that follows the server’s answer, so it reads the ' +
        'state the answer was written into — the visitor’s branch reads the prop',
    ).toBe(NUNCA_ENVIADO)
  })

  it('adopts the answer rather than incrementing on its own', async () => {
    const server = new FakeCurtirServer({ curtidas: 40, curtido: true })
    const { tree, dispatcher } = mount({
      curtidas: CURTIDAS,
      isSignedIn: true,
      onCurtir: server.curtir,
    })
    const pending = (buttonOf(tree).props.onClick as () => Promise<void>)()
    expect(
      dispatcher.updates,
      'nothing may be written before the server answers: an optimistic bump that sticks is ' +
        'precisely what FR-026 forbids',
    ).toEqual([])
    await pending
    expect(server.calls).toBe(1)
    // 40, not 33: an implementation that added one locally would push 33 whatever the server said.
    expect(applied(dispatcher.updates[0], { curtidas: CURTIDAS, curtido: false })).toEqual({
      curtidas: 40,
      curtido: true,
    })
  })
})

describe('LikeButton — the rules every component in this package keeps', () => {
  it('is an island, with the directive as the first statement', () => {
    // Below an import, `use client` is an expression statement React never sees: the component
    // stays a server component and its useState fails at build (islands.test.ts § inert).
    expect(readFileSync(SOURCE_PATH, 'utf8').trimStart().startsWith("'use client'")).toBe(true)
  })

  it('resolves every colour through a token — no literal reaches any style object', () => {
    for (const estados of [COMO_PEDIDO, CONVITE_ABERTO]) {
      for (const element of elementsOf(mount({ curtidas: CURTIDAS }, estados).tree)) {
        for (const [property, value] of Object.entries(element.props.style ?? {})) {
          if (typeof value !== 'string') continue
          expect(`${property}: ${value}`).not.toMatch(HEX_COLOUR)
        }
      }
    }
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(HEX_COLOUR)
    // CLR-001: the raw pink follows no organization's theme.
    expect(source).not.toContain('--color-rosa-raw')
  })
})

describe('LikeButton — the two surfaces it can sit on (FR-028)', () => {
  /**
   * `/aulas` and `/biblioteca-3d` paint `--surface-page: var(--surface-inverted)` — white — and
   * FR-028 forbids *"rosa em texto pequeno sobre branco"* there. The accent this control wears
   * by default measures about 1.8:1 on that surface, so on those two pages it is not a style
   * preference: it is a count most readers would lose.
   *
   * This is a regression that happened, not a hypothetical. Before the prop existed, the island
   * replaced `biblioteca-3d`'s own `ESTILO.coracao` — which already carried the navy, decided in
   * that page spec's round 2 — and repainted the number pink on white on both pages. The one
   * gate that saw it was `aulas-page.test.ts` § 2, which scans **rendered** CSS;
   * `biblioteca-3d-page.test.ts`'s scan reads the page *source* for inline styles and is
   * structurally unable to see a class rule a component hoists.
   */
  /** The ink the root actually carries — where a `<button>` inheriting `color` gets it from. */
  const tintaDe = (tree: AnyElement): unknown => tree.props.style?.color

  it('wears the accent by default — the navy card is what it was drawn against', () => {
    expect(tintaDe(mount({ curtidas: CURTIDAS }).tree)).toBe('var(--color-primary)')
  })

  it('wears the light page’s own ink when asked for it', () => {
    expect(tintaDe(mount({ curtidas: CURTIDAS, surface: 'light' }).tree)).toBe(
      'var(--text-on-light)',
    )
  })

  it('ships NO accent declaration in the stylesheet — a light page must receive none', () => {
    // The point of keying the ink inline rather than with a `--light` modifier class. A modifier
    // would leave `.fl-like { color: var(--color-primary) }` in the markup of every page that
    // mounts this control, including the two white ones, where the gate that guards FR-028 is
    // deliberately cascade-blind and cannot tell an overridden rule from an applied one.
    expect(
      LIKE_BUTTON_CSS,
      'the accent is back in the stylesheet, so every light page now receives a pink ' +
        'declaration it must not have — see `aulas-page.test.ts` § 2',
    ).not.toMatch(/--color-primary/)
    const heart = /\.fl-like\s*\{([^}]*)\}/.exec(LIKE_BUTTON_CSS)?.[1] ?? ''
    expect(
      heart,
      'a <button> does not inherit `color`, so without this the ink set on the root never ' +
        'reaches the glyph or the number and both surfaces render the browser default',
    ).toMatch(/color:\s*inherit/)
  })

  it('leaves the focus ring to the region, on both surfaces', () => {
    // `tokens/focus.css` makes `--focus-ring-color` a property the light pages re-declare
    // beside `--surface-page`. A hard-coded ring here would be a second opinion on a question
    // already answered, and it would be the wrong one on exactly one of the two surfaces.
    expect(LIKE_BUTTON_CSS).not.toMatch(/outline:[^;]*var\(--color-(primary|navy)\)/)
  })
})
