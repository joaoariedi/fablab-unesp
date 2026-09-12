import { expect } from 'vitest'

/**
 * The CSS and markup primitives `breakpoints-focus.test.ts` scores a page with, moved out of it
 * so that **one** gate can cover both the six public pages and the signup flow (T035c, CLR-009)
 * without either the file or the standard being duplicated.
 *
 * Nothing here changed in the move: every function and every comment is the one that was written
 * where the defect it records was measured. What the move buys is that a second section can reach
 * them — CLR-009's *"003's own gate extended to these routes, not a second standard"* is a claim
 * about the ASSERTIONS being the same ones, and two copies of a resolver is how two standards
 * start.
 */

/** Tags that put an element in the keyboard tab order on their own. `<a>` only with an `href`;
 *  an anchor without one is not focusable, and requiring a ring for it would demand CSS for an
 *  element no keyboard visitor can ever reach. */
export const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'summary'] as const

/** Comments may contain anything, including a width or an `outline: none` written as prose. */
export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `--token: value` declaration in a stylesheet or a style attribute, last write winning,
 *  as the cascade does for a flat file. */
export function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}"]+)/g)) {
    found.set(match[1]!, match[2]!.trim())
  }
  return found
}

/**
 * A colour value with its `var()` chain resolved to whatever it finally names.
 *
 * `--focus-ring-color: var(--color-primary)` → `var(--color-rosa-raw)` → `#EE9DC4`. Chains are
 * how the token layer expresses "the per-organization accent" (CLR-001), and a check that
 * stopped at the first `var()` could not score any of them.
 */
export function resolveColour(value: string, props: Map<string, string>): string {
  let current = value.trim()
  const seen = new Set<string>()
  for (;;) {
    const reference = /var\(\s*(--[a-z0-9-]+)/.exec(current)
    if (!reference) return current
    const name = reference[1]!
    // A cycle would otherwise spin here forever; report the name so the loop is findable.
    expect(seen.has(name), `custom property cycle at ${name}`).toBe(false)
    seen.add(name)
    const next = props.get(name)
    expect(next, `${name} is referenced but never declared`).toBeDefined()
    current = next!
  }
}

/** The `<style>` blocks a rendered page carries — its own rules and every component's. */
export const inlineCss = (markup: string): string =>
  [...markup.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).join('\n')

export interface Target {
  readonly tag: string
  readonly classes: readonly string[]
  readonly html: string
}

/** Every element in the markup a keyboard visitor can Tab to. */
export function interactiveTargets(markup: string): Target[] {
  const pattern = new RegExp(`<(?:${INTERACTIVE_TAGS.join('|')})\\b[^>]*>|<[a-z]+[^>]*tabindex="0"[^>]*>`, 'g')
  return (markup.match(pattern) ?? [])
    .map((html) => ({
      tag: /^<([a-z]+)/.exec(html)![1]!,
      classes: (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/).filter(Boolean),
      html,
    }))
    // An anchor with no href is not in the tab order, so it needs no ring.
    .filter((target) => target.tag !== 'a' || target.html.includes(' href="'))
    // A hidden input is not focusable, has no box and is never pressed — step 2 carries two of
    // them (the avatar draft and the terms version). Demanding a ring or a 44px target for one
    // is demanding CSS for an element that is not on the screen at all.
    .filter((target) => !target.html.includes('type="hidden"'))
}

/** What the `:focus-visible` rules in a stylesheet select: tag names and class names.
 *
 *  `:where(a[href], button, …):focus-visible` is one rule listing many shapes, so the arguments
 *  of a leading `:where()`/`:is()` are expanded rather than split on as top-level commas —
 *  splitting the raw selector would hand back `:where(a[href]` and lose the pseudo-class. */
export function focusCoverage(css: string): { tags: Set<string>; classes: Set<string> } {
  const tags = new Set<string>()
  const classes = new Set<string>()
  for (const [, selector] of stripComments(css).matchAll(/([^{}]*:focus-visible[^{}]*)\{/g)) {
    const grouped = /:(?:where|is)\(([^)]*)\)/.exec(selector!)
    for (const part of (grouped ? grouped[1]! : selector!).split(',')) {
      const tag = /(?:^|\s|>)([a-z]+)(?=[.:[\s]|$)/.exec(part.trim())
      if (tag) tags.add(tag[1]!)
      for (const [, name] of part.matchAll(/\.([A-Za-z0-9_-]+)/g)) classes.add(name!)
      if (/\[tabindex="0"\]/.test(part)) tags.add('[tabindex="0"]')
    }
  }
  return { tags, classes }
}

/**
 * A cascade resolver, ported from `packages/ui/tests/shell.test.ts`.
 *
 * SC-010's validation method names that file: *"breakpoint tests per page, **as feature 001 did
 * for the shell**"*, and what feature 001 did was RESOLVE the cascade at each width and assert
 * the outcome. Its docblock rejects the weaker form in as many words:
 *
 *   *"`expect(css).toContain('@media (min-width: 834px)')` is the obvious assertion and it
 *   proves almost nothing: it stays green when the block is empty, when it sets
 *   `display: none` on the bar it was supposed to reveal, or when a later base rule overrides
 *   it."*
 *
 * The first version of § 1 was exactly that form — it counted queries and checked their widths
 * and never evaluated a page at any width. Ported rather than imported because the two suites
 * live in different packages and the purity boundary forbids the edge; it is 40 lines, and the
 * alternative was to keep asserting the thing feature 001 already recorded as worthless.
 */
export interface Block { readonly prelude: string; readonly body: string }
export interface StyleRule {
  readonly minWidth: number
  readonly selectors: readonly string[]
  readonly declarations: Map<string, string>
}

export function topLevelBlocks(css: string): Block[] {
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

export function declarationsOf(body: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
  }
  return found
}

export const minWidthOf = (prelude: string): number | null => {
  const match = /^@media\s*\(\s*min-width:\s*(\d+)px\s*\)$/.exec(prelude.trim())
  return match === null ? null : Number(match[1])
}

export function rulesOf(css: string, minWidth = 0): StyleRule[] {
  const rules: StyleRule[] = []
  for (const block of topLevelBlocks(stripComments(css))) {
    if (block.prelude.startsWith('@media')) {
      // A non-`min-width` query resolves at no target here; § 1's own max-width case is what
      // rejects one outright, rather than this silently treating it as always-on.
      rules.push(...rulesOf(block.body, minWidthOf(block.prelude) ?? Number.POSITIVE_INFINITY))
      continue
    }
    if (block.prelude.startsWith('@')) continue
    rules.push({
      minWidth,
      selectors: block.prelude.split(',').map((one) => one.trim()),
      declarations: declarationsOf(block.body),
    })
  }
  return rules
}

/** Every declaration in force at `width`, as `selector{property}` → value. Last write wins,
 *  which is the cascade for rules of equal specificity — which these are: all single classes. */
export function resolvedAt(css: string, width: number): Map<string, string> {
  const resolved = new Map<string, string>()
  for (const rule of rulesOf(css)) {
    if (rule.minWidth > width) continue
    for (const selector of rule.selectors) {
      for (const [property, value] of rule.declarations) {
        resolved.set(`${selector}{${property}}`, value)
      }
    }
  }
  return resolved
}

/** What actually changed between two widths — the properties, so a failure names them. */
export function changedBetween(css: string, from: number, to: number): string[] {
  const before = resolvedAt(css, from)
  const after = resolvedAt(css, to)
  return [...after].filter(([key, value]) => before.get(key) !== value).map(([key]) => key)
}

/**
 * Every `style="…"` attribute in the markup, joined — the medium the pages actually write in.
 *
 * `inlineCss` above reads `<style>` blocks only, and none of the six pages puts its layout or
 * its outlines there: all six express them as `ESTILO: Record<string, CSSProperties>` objects
 * that React renders into `style` attributes. Measured on this tree, and it is the defect this
 * section exists for — adding `outline: 'none'` to `ESTILO.titulo` in
 * `biblioteca-3d/page.tsx`, the object applied to every card-title link on that listing, left
 * all 47 cases GREEN. An inline declaration beats the zero-specificity `:where(…)` rule in the
 * real cascade, so the ring was genuinely destroyed on the page's most numerous target, by
 * exactly the edit § 2's comment calls "the single most common way FR-023 is lost".
 */
export const attributeCss = (markup: string): string =>
  [...markup.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]!.replaceAll('&quot;', '"')).join(';\n')

/** Both media at once. Anything asking "what does this page declare" must read both, because
 *  the pages use one and the components use the other. */
export const allCss = (markup: string): string => [inlineCss(markup), attributeCss(markup)].join('\n')

/**
 * ── The box a control declares (T035c / FR-032b) ────────────────────────────────────────────
 *
 * Everything below answers one question the six-page gate never asked: how large is the target a
 * finger has to land on? The reasoning behind each rule — why a DECLARED minimum rather than a
 * painted box, and the three exceptions — is written where the assertions are, in
 * `breakpoints-focus.test.ts` § 5. These are the mechanics.
 */
/** One element's own `style` attribute, unescaped. React writes `&quot;` inside it for a quoted
 *  value, and `declarationsOf` would otherwise read the entity as part of the value. */
export const estiloDe = (alvo: Target): string =>
  (/\sstyle="([^"]*)"/.exec(alvo.html)?.[1] ?? '').replaceAll('&quot;', '"')

/** Whether a rule's selector reaches this element. Only simple selectors — a tag, a class, or a
 *  tag with classes — are answered; anything with a combinator, an attribute or a pseudo-class is
 *  skipped rather than guessed at, and a size declared only inside one is a size this gate
 *  reports as missing. Under-reading is the safe direction: it fails loudly. */
export function seletorAtinge(selector: string, alvo: Target): boolean {
  const simples = selector.trim()
  if (simples === '' || !/^[a-z]*(?:\.[A-Za-z0-9_-]+)*$/.test(simples)) return false
  const tag = /^[a-z]+/.exec(simples)?.[0]
  if (tag !== undefined && tag !== alvo.tag) return false
  const classes = [...simples.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((achado) => achado[1]!)
  if (tag === undefined && classes.length === 0) return false
  return classes.every((nome) => alvo.classes.includes(nome))
}

/** Every declaration in force on one element at `width`: the sheet rules that select it, then its
 *  own style attribute over the top — the order a browser resolves them in. */
export function emVigor(alvo: Target, css: string, width: number): Map<string, string> {
  const resolvido = new Map<string, string>()
  for (const regra of rulesOf(css)) {
    if (regra.minWidth > width) continue
    for (const selector of regra.selectors) {
      if (!seletorAtinge(selector, alvo)) continue
      for (const [propriedade, valor] of regra.declarations) resolvido.set(propriedade, valor)
    }
  }
  for (const [propriedade, valor] of declarationsOf(estiloDe(alvo))) {
    resolvido.set(propriedade, valor)
  }
  return resolvido
}

/** A length in pixels, with its token chain resolved. Anything that is not a plain `px` — a
 *  percentage, `auto`, a `calc` — is 0: a box this arithmetic cannot evaluate is not a box the
 *  gate may call conforming. */
export function medida(valor: string | undefined, props: Map<string, string>): number {
  if (valor === undefined) return 0
  const resolvido = resolveColour(valor, props).trim()
  return /^\d+(?:\.\d+)?px$/.test(resolvido) ? Number.parseFloat(resolvido) : 0
}

/** The `<label>` wrapping this control, as a target in its own right — exception 2. Labels do not
 *  nest in this markup, so the first block containing the element's own tag is its label. */
export function rotuloEnvolvente(alvo: Target, markup: string): Target | null {
  for (const [bloco] of markup.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)) {
    if (!bloco!.includes(alvo.html)) continue
    const abertura = /^<label\b[^>]*>/.exec(bloco!)![0]
    return {
      tag: 'label',
      classes: (/class="([^"]*)"/.exec(abertura)?.[1] ?? '').split(/\s+/).filter(Boolean),
      html: abertura,
    }
  }
  return null
}

/** The text that fills a control's inline axis (exception 3): its own, or — for a control whose
 *  label is what a press lands on (exception 2) — the label's. */
export function textoDe(alvo: Target, markup: string): string {
  const proprio = textoEntreTags(alvo, markup)
  if (proprio.length > 1) return proprio
  const rotulo = rotuloEnvolvente(alvo, markup)
  return rotulo === null ? proprio : textoEntreTags(rotulo, markup)
}

/** One element's own text, tags stripped. `<label>`, `<a>` and `<button>` do not nest in this
 *  markup, so the first matching close tag is the element's own. */
export function textoEntreTags(alvo: Target, markup: string): string {
  if (!['a', 'button', 'label'].includes(alvo.tag)) return ''
  const inicio = markup.indexOf(alvo.html)
  const fecho = markup.indexOf(`</${alvo.tag}>`, inicio)
  if (inicio === -1 || fecho === -1) return ''
  return markup
    .slice(inicio + alvo.html.length, fecho)
    .replaceAll(/<[^>]*>/g, '')
    .trim()
}

/** The largest box declared for the press: the control's own, or its label's (exception 2). */
export function caixaDe(
  alvo: Target,
  markup: string,
  css: string,
  props: Map<string, string>,
  width: number,
): { altura: number; largura: number } {
  const caixas = [alvo, rotuloEnvolvente(alvo, markup)].filter((um): um is Target => um !== null)
  const de = (propriedades: readonly string[]): number =>
    Math.max(
      ...caixas.map((um) => {
        const declarado = emVigor(um, css, width)
        return Math.max(...propriedades.map((nome) => medida(declarado.get(nome), props)))
      }),
    )
  return { altura: de(['min-height', 'height']), largura: de(['min-width', 'width']) }
}

/** Exception 1: an anchor that declares no `display` is inline, and WCAG 2.5.8 exempts a target
 *  in a sentence. Only anchors — a `<button>` left inline is a control, not prose. */
export function ehLinkEmTexto(alvo: Target, css: string, width: number): boolean {
  if (alvo.tag !== 'a') return false
  return (emVigor(alvo, css, width).get('display') ?? 'inline').trim() === 'inline'
}
