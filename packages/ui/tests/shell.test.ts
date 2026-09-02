import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { DESKTOP_TABS, MENU_TABS, MOBILE_TABS, TABLET_TABS, type ShellTab } from '../src/shell/tabs'

/**
 * T032 / SC-004, SC-005 — the shell at the three design targets, as far as `node` can see it.
 *
 * SC-004 is worded as two halves and this file asserts both: *"assert the **tab-set data**
 * (six desktop in canonical order, four tablet, five mobile ending `PERFIL`) **and** that the
 * CSS contains the media queries that switch them"*. SC-005 is the negative of the first half:
 * *"`BIBLIOTECA 3D` and `INSTAGRAM` never appear in a compact bar"* — absent from the tablet
 * and mobile sets, present in the menu set.
 *
 * ── Why this file imports `tabs.ts` and never a component ───────────────────────────────────
 *
 * The sets were extracted into a JSX-free module (T027b) precisely so these two criteria could
 * be asserted without pulling a `.tsx` into Vitest's module graph, which CLR-003 forbids adding
 * a transform for. The task says it in as many words — *"by importing `tabs.ts` — never
 * `HeaderNav.tsx`"* — so the last describe block below reads this file's own source and fails
 * if a `.tsx` import ever appears in it. The rule is worth nothing if nothing enforces it: the
 * import that breaks it is one "just for the CSS constant" away, and it would look tidy.
 *
 * The stylesheets, however, *do* live in the components (each is a `<style href … precedence>`
 * value — the three closed doors are documented in `HeaderNav.tsx`). This file therefore reads
 * those files as **text**, resolves the `${CLASS.x}` interpolations from the same source, and
 * works on the resulting CSS. Text, not an import: the criterion is about what the stylesheet
 * says, and reading it is the only way to ask that question from here.
 *
 * ── Why the queries are *evaluated* rather than string-matched ──────────────────────────────
 *
 * `expect(css).toContain('@media (min-width: 834px)')` is the obvious assertion and it proves
 * almost nothing: it stays green when the block is empty, when it sets `display: none` on the
 * bar it was supposed to reveal, or when a later base rule overrides it. What SC-004 asks is
 * that the queries *switch the sets* — so the cascade is resolved below at each of the three
 * design targets and the resulting `display` is what is asserted. It is a deliberately small
 * evaluator (source order wins, single-class selectors only, no specificity algebra) and that
 * is honest for this stylesheet, where every selector is one class.
 *
 * ── What this file cannot prove ────────────────────────────────────────────────────────────
 *
 * That a browser paints it. Resolving `display` from the text is not the cascade running on a
 * real page against a real viewport — plan § *"What these tests can and cannot prove"* puts
 * "that CSS actually shows and hides them at 390 / 834 / 1440" squarely in feature 003's
 * Playwright column. Everything below is data, arithmetic or file text.
 */

const SHELL_DIR = fileURLToPath(new URL('../src/shell/', import.meta.url))
const OWN_SOURCE_PATH = fileURLToPath(import.meta.url)

/** The three design targets (`tokens/layout.css`). Any other width in a query is a magic number. */
const DESIGN_TARGETS = [390, 834, 1440] as const
type DesignTarget = (typeof DESIGN_TARGETS)[number]

/** The canonical desktop order, verbatim from `concept.md`. Six items, no menu button. */
const CANONICAL_DESKTOP = [
  'BIBLIOTECA 3D',
  'PROJETOS',
  'CALENDÁRIO',
  'AULAS',
  'INSTAGRAM',
  'ARTIGOS',
] as const

/** The tablet bar: the desktop order minus the two that move into the menu. */
const CANONICAL_TABLET = ['PROJETOS', 'CALENDÁRIO', 'AULAS', 'ARTIGOS'] as const

/** The mobile bottom bar: the tablet four, then `PERFIL` in the fifth position. */
const CANONICAL_MOBILE = ['PROJETOS', 'CALENDÁRIO', 'AULAS', 'ARTIGOS', 'PERFIL'] as const

/** The two SC-005 keeps out of every compact bar and inside the menu. */
const MENU_ONLY = ['BIBLIOTECA 3D', 'INSTAGRAM'] as const

function labelsOf(tabs: readonly ShellTab[]): string[] {
  return tabs.map((tab) => tab.label)
}

// ── The stylesheets, read as text ───────────────────────────────────────────────────────────

interface ShellSheet {
  /** The file the rules travel in, for failure messages. */
  readonly file: string
  /** The CSS with every `${CLASS.x}` resolved from the same file's own constants. */
  readonly css: string
  /** Those constants, so a test can name a slot (`CLASS.nav`) instead of a literal class. */
  readonly names: ReadonlyMap<string, string>
}

function sourceOf(file: string): string {
  const path = resolve(SHELL_DIR, file)
  expect(existsSync(path), `${path} does not exist`).toBe(true)
  return readFileSync(path, 'utf8')
}

/**
 * The single-quoted string constants a shell component builds its class names from.
 *
 * Both shapes the shell uses: the `CLASS` object (keyed `CLASS.nav`, matching the way the
 * template literal interpolates it) and top-level `const NAME = '…'` such as `MobileTabBar`'s
 * keyframe name. Restricted to the `CLASS` block rather than sweeping every `key: 'value'` in
 * the file, so an unrelated object literal cannot quietly supply a class name.
 */
function nameConstantsOf(source: string): Map<string, string> {
  const names = new Map<string, string>()
  // Both groups are non-optional in each pattern, so a match always carries them — `?? ''`
  // is what `noUncheckedIndexedAccess` costs for reading them, not a case that can occur.
  for (const [, name, value] of source.matchAll(/^const (\w+) = '([^']*)'$/gm)) {
    names.set(name ?? '', value ?? '')
  }
  const classBlock = /const CLASS = \{([\s\S]*?)^\} as const/m.exec(source)?.[1] ?? ''
  for (const [, key, value] of classBlock.matchAll(/(\w+): '([^']*)'/g)) {
    names.set(`CLASS.${key ?? ''}`, value ?? '')
  }
  return names
}

/** The exported `…_CSS` template literal, verbatim, interpolations still unresolved. */
function cssLiteralOf(source: string, constant: string, file: string): string {
  const match = new RegExp(`export const ${constant} = \`([\\s\\S]*?)\``).exec(source)
  expect(match, `${file} must export ${constant} as a template literal`).not.toBeNull()
  return match?.[1] ?? ''
}

/** `.${CLASS.nav}` → `.fl-header__nav`. An unresolved name is a failure, never a silent gap. */
function interpolate(css: string, names: ReadonlyMap<string, string>, file: string): string {
  return css.replace(/\$\{([\w.]+)\}/g, (_whole, name: string) => {
    const value = names.get(name)
    expect(value, `${file}: cannot resolve \${${name}} — its constant is not a plain string`)
      .toBeDefined()
    return value ?? ''
  })
}

function sheet(file: string, constant: string): ShellSheet {
  const source = sourceOf(file)
  const names = nameConstantsOf(source)
  return { file, names, css: interpolate(cssLiteralOf(source, constant, file), names, file) }
}

const HEADER = sheet('HeaderNav.tsx', 'HEADER_NAV_CSS')
const TAB_BAR = sheet('MobileTabBar.tsx', 'MOBILE_TAB_BAR_CSS')
const MENU = sheet('MenuSheet.tsx', 'MENU_SHEET_CSS')
const SHEETS: readonly ShellSheet[] = [HEADER, TAB_BAR, MENU]

/** The class the sheet gives that slot, as a selector. A renamed key fails here, by name. */
function selector(shellSheet: ShellSheet, key: string): string {
  const value = shellSheet.names.get(key)
  expect(value, `${shellSheet.file} no longer declares ${key}`).toBeDefined()
  return `.${value ?? ''}`
}

// ── A very small cascade ────────────────────────────────────────────────────────────────────

interface Block {
  readonly prelude: string
  readonly body: string
}

interface StyleRule {
  /** 0 for a base rule; the query's width for one inside `@media (min-width: …)`. */
  readonly minWidth: number
  readonly selectors: readonly string[]
  readonly declarations: ReadonlyMap<string, string>
}

/** Brace-balanced split into `prelude { body }`, so a nested at-rule stays one block. */
function topLevelBlocks(css: string): Block[] {
  const blocks: Block[] = []
  let depth = 0
  let preludeStart = 0
  let bodyStart = 0
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index]
    if (character === '{') {
      depth += 1
      if (depth === 1) bodyStart = index + 1
    } else if (character === '}') {
      depth -= 1
      if (depth !== 0) continue
      blocks.push({
        prelude: css.slice(preludeStart, bodyStart - 1).trim(),
        body: css.slice(bodyStart, index),
      })
      preludeStart = index + 1
    }
  }
  expect(depth, 'unbalanced braces in the stylesheet').toBe(0)
  return blocks
}

function declarationsOf(body: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
  }
  return declarations
}

/** The width a `@media (min-width: 834px)` prelude switches at; `null` for anything else. */
function minWidthOf(prelude: string): number | null {
  const match = /^@media\s*\(\s*min-width:\s*(\d+)px\s*\)$/.exec(prelude.trim())
  return match === null ? null : Number(match[1])
}

/** Every style rule, flattened, in source order, each tagged with the width it applies from. */
function rulesOf(css: string, minWidth = 0): StyleRule[] {
  const rules: StyleRule[] = []
  for (const block of topLevelBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (block.prelude.startsWith('@media')) {
      // A non-`min-width` query resolves at no target here; the FR-012 sweep below is what
      // rejects it outright, rather than this silently treating it as always-on.
      rules.push(...rulesOf(block.body, minWidthOf(block.prelude) ?? Number.POSITIVE_INFINITY))
      continue
    }
    // `@keyframes` is not a style rule — its `from`/`to` blocks are not selectors.
    if (block.prelude.startsWith('@')) continue
    rules.push({
      minWidth,
      selectors: block.prelude.split(',').map((one) => one.trim()),
      declarations: declarationsOf(block.body),
    })
  }
  return rules
}

/**
 * The value a property resolves to for one selector at one viewport width.
 *
 * Source order wins, which is the whole algorithm: every selector in these sheets is a single
 * class, so specificity never breaks a tie and the cascade reduces to "the last matching rule".
 * A sheet that grew compound selectors would need more than this — and would be saying that
 * the switch is no longer readable from the text, which is worth failing over.
 */
function resolve_(rules: readonly StyleRule[], target: string, property: string, width: number) {
  let value: string | undefined
  for (const rule of rules) {
    if (rule.minWidth > width) continue
    if (!rule.selectors.includes(target)) continue
    value = rule.declarations.get(property) ?? value
  }
  return value
}

function isShown(shellSheet: ShellSheet, key: string, width: number): boolean {
  return resolve_(rulesOf(shellSheet.css), selector(shellSheet, key), 'display', width) !== 'none'
}

/** The width, among the design targets, at which a slot flips from hidden to shown. */
function shownFrom(shellSheet: ShellSheet, key: string): DesignTarget | undefined {
  return DESIGN_TARGETS.find((width) => isShown(shellSheet, key, width))
}

/** The first target at which a slot is gone. */
function hiddenFrom(shellSheet: ShellSheet, key: string): DesignTarget | undefined {
  return DESIGN_TARGETS.find((width) => !isShown(shellSheet, key, width))
}

// ── SC-004, first half: the tab-set data ────────────────────────────────────────────────────

describe('SC-004 — the tab-set data the header is built from', () => {
  it('desktop is the designer\'s six, in the canonical order', () => {
    // `toEqual` over the whole array: the order IS the decision ("nesta ordem"), and a
    // membership check stays green with CALENDÁRIO and AULAS swapped — the exact drift
    // rounds 2 and 3 had to correct in the mockups.
    expect(labelsOf(DESKTOP_TABS)).toEqual([...CANONICAL_DESKTOP])
  })

  it('tablet is four tabs, and they are the desktop order with two removed', () => {
    expect(labelsOf(TABLET_TABS)).toEqual([...CANONICAL_TABLET])
    expect(TABLET_TABS).toHaveLength(4)
    const positions = labelsOf(TABLET_TABS).map((label) => labelsOf(DESKTOP_TABS).indexOf(label))
    expect(positions).not.toContain(-1)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it('mobile is five positions and the last one is PERFIL', () => {
    expect(labelsOf(MOBILE_TABS)).toEqual([...CANONICAL_MOBILE])
    expect(MOBILE_TABS).toHaveLength(5)
    // PERFIL last, not merely present: a bar that opens with the account is a different bar.
    expect(MOBILE_TABS.at(-1)?.label).toBe('PERFIL')
  })

  it('drops exactly the two tabs the menu keeps — the sets are one decision, not three', () => {
    // Ties the three sets together rather than asserting each literal in isolation: the count
    // that separates desktop from the compact bars is the count of menu-only tabs, and any
    // future seventh destination has to make all three statements true at once.
    expect(DESKTOP_TABS.length - TABLET_TABS.length).toBe(MENU_ONLY.length)
    expect(labelsOf(MOBILE_TABS).slice(0, 4)).toEqual(labelsOf(TABLET_TABS))
  })
})

// ── SC-005: the negative ────────────────────────────────────────────────────────────────────

describe('SC-005 — BIBLIOTECA 3D and INSTAGRAM never reach a compact bar', () => {
  it.each(MENU_ONLY)('%s is absent from the tablet bar', (label) => {
    expect(labelsOf(TABLET_TABS)).not.toContain(label)
  })

  it.each(MENU_ONLY)('%s is absent from the mobile bottom bar', (label) => {
    expect(labelsOf(MOBILE_TABS)).not.toContain(label)
  })

  it.each(MENU_ONLY)('%s is present in the menu set, which is where it lives', (label) => {
    // The absence assertions above are satisfied by deleting the tab from the platform
    // entirely. This is the half that says the destination is still reachable.
    expect(labelsOf(MENU_TABS)).toContain(label)
  })

  it('keeps the menu complete: every desktop tab, in the canonical order', () => {
    expect(labelsOf(MENU_TABS)).toEqual([...CANONICAL_DESKTOP])
  })
})

// ── SC-004, second half: the queries that switch them ───────────────────────────────────────

describe('SC-004 — the header switches its tab set in the cascade', () => {
  it('hides the desktop nav below the tablet target and shows it from 834 up', () => {
    expect(isShown(HEADER, 'CLASS.nav', 390)).toBe(false)
    expect(isShown(HEADER, 'CLASS.nav', 834)).toBe(true)
    expect(isShown(HEADER, 'CLASS.nav', 1440)).toBe(true)
  })

  it('reveals the two wide-only tabs at 1440 and nowhere below it', () => {
    // This is SC-005 expressed in the cascade rather than in the data: the two tabs are in
    // the markup at every width (the header ships no JavaScript to choose), so the ONLY
    // thing keeping them out of the compact bars is this rule.
    expect(isShown(HEADER, 'CLASS.wideOnly', 390)).toBe(false)
    expect(isShown(HEADER, 'CLASS.wideOnly', 834)).toBe(false)
    expect(isShown(HEADER, 'CLASS.wideOnly', 1440)).toBe(true)
  })

  it('carries the menu button at the compact targets and drops it at 1440', () => {
    // US3: "desktop shows six tabs and no menu button".
    expect(isShown(HEADER, 'CLASS.menu', 390)).toBe(true)
    expect(isShown(HEADER, 'CLASS.menu', 834)).toBe(true)
    expect(isShown(HEADER, 'CLASS.menu', 1440)).toBe(false)
  })
})

describe('SC-004 — the bottom bar and the menu switch at the same widths', () => {
  it('shows the mobile bottom bar at 390 only', () => {
    expect(isShown(TAB_BAR, 'CLASS.bar', 390)).toBe(true)
    expect(isShown(TAB_BAR, 'CLASS.bar', 834)).toBe(false)
    expect(isShown(TAB_BAR, 'CLASS.bar', 1440)).toBe(false)
  })

  it('withdraws the menu trigger at 1440, where every tab is already in the bar', () => {
    expect(isShown(MENU, 'CLASS.root', 390)).toBe(true)
    expect(isShown(MENU, 'CLASS.root', 834)).toBe(true)
    expect(isShown(MENU, 'CLASS.root', 1440)).toBe(false)
  })

  it('never leaves a target with no navigation at all', () => {
    // The bottom bar leaving and the header nav arriving are two rules in two files, and
    // nothing but this makes them the same width. Off by one target in either direction and
    // 834 (or 390) has neither bar — a state each file's own test reads as correct.
    expect(hiddenFrom(TAB_BAR, 'CLASS.bar')).toBe(shownFrom(HEADER, 'CLASS.nav'))
  })

  it('never leaves a target where the menu-only tabs are unreachable', () => {
    // The mirror invariant: the trigger may only disappear at the width the wide-only tabs
    // appear. Withdraw it one target early and BIBLIOTECA 3D and INSTAGRAM exist in the
    // markup, hidden, with nothing that opens them — SC-005's failure, upside down.
    expect(hiddenFrom(MENU, 'CLASS.root')).toBe(shownFrom(HEADER, 'CLASS.wideOnly'))
    expect(hiddenFrom(HEADER, 'CLASS.menu')).toBe(shownFrom(HEADER, 'CLASS.wideOnly'))
  })
})

describe('the shell\'s queries are mobile-first, at the design targets (FR-012)', () => {
  it.each(SHEETS.map((one) => [one.file, one] as const))(
    '%s: every @media is min-width at 390, 834 or 1440',
    (_file, shellSheet) => {
      // `tests/layout-tokens.test.ts` owns this rule but walks `.css` under `src/`; the
      // shell's rules travel in a `.tsx`, so the guard does not reach them and `min-width:
      // 800px` would pass every other suite in the package.
      const preludes = [...shellSheet.css.matchAll(/@media[^{]*/g)].map((one) => one[0].trim())
      expect(preludes.length, `${shellSheet.file} switches nothing`).toBeGreaterThan(0)
      for (const prelude of preludes) {
        const width = minWidthOf(prelude)
        expect(width, `${shellSheet.file}: "${prelude}" is not a mobile-first min-width query`)
          .not.toBeNull()
        expect(DESIGN_TARGETS, `${shellSheet.file}: ${prelude ?? ''} is a magic number`)
          .toContain(width as DesignTarget)
      }
    },
  )
})

// ── The constraint on this file itself ──────────────────────────────────────────────────────

describe('this suite reads the shell without importing any of it (T032, CLR-003)', () => {
  it('imports tabs.ts and no module that resolves to a .tsx', () => {
    // The reason `tabs.ts` was extracted at all. One `import { HEADER_NAV_CSS } from
    // '../src/shell/HeaderNav'` — which is exactly what a reader reaching for the CSS would
    // write — puts JSX back in Vitest's module graph, and CLR-003 forbids adding the
    // transform. It would look like a simplification of the text-reading above.
    const source = readFileSync(OWN_SOURCE_PATH, 'utf8')
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '')
    const jsx = specifiers.filter((specifier) => {
      if (!specifier.startsWith('.')) return false
      const target = resolve(dirname(OWN_SOURCE_PATH), specifier)
      return specifier.endsWith('.tsx') || existsSync(`${target}.tsx`)
    })
    expect(jsx, `shell.test.ts imports JSX modules: ${jsx.join(', ')}`).toEqual([])
    expect(specifiers).toContain('../src/shell/tabs')
  })
})
