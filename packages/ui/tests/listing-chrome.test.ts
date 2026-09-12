import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { PRIMARY_BUTTON_STYLE } from '../src/components/Button'
import { CardProjeto, type CardProjetoProps } from '../src/components/CardProjeto'
import { EMPTY_STATE_CSS, EmptyState, type EmptyStateProps } from '../src/components/EmptyState'
import { DOCUMENTED_PAIRS } from '../src/tokens'
import { LISTING_GRID_COLUMNS, ListingGrid } from '../src/components/ListingGrid'
import { IsoShape } from '../src/shapes/IsoShape'

/**
 * T011 / FR-004, FR-017, FR-018 — the listing chrome: the project card, the empty/error body
 * and the grid the four listings share.
 *
 * The source is `docs/product/pages/projetos.md` § *Grid de projetos*: *"**3 colunas** … gutter
 * uniforme. Card de projeto (contorno fino claro, cantos levemente arredondados, fundo navy):
 * foto … sangrada de borda a borda (proporção medida no mockup ~3:2); chip de categoria rosa
 * com texto navy em caps, sobreposto no canto inferior esquerdo da foto; título em display
 * caps; descrição curta em duas linhas; rodapé do card (separado por linha divisória): avatar
 * pixel + nome + `@nomesobrenome` + `NÍVEL n` … ícone de coração outline rosa + contador de
 * curtidas e, após divisória vertical, seta `→` rosa (ação principal do card)"*; § *Adaptação
 * tablet* — *"**2 colunas**"*; § *Adaptação mobile* — *"**1 coluna** … foto em 16:9"*; and
 * § *Estados e interações* — *"Vazio: `Nenhum projeto encontrado.` … + botão `LIMPAR FILTROS`,
 * com ornamento isométrico. Erro: `Não foi possível carregar os projetos.` + botão
 * `TENTAR NOVAMENTE`"*.
 *
 * ── Why one file for three modules ──────────────────────────────────────────────────────────
 *
 * They are one decision — a listing is a grid of cards with a defined answer for "no cards" —
 * and the walk/cascade helpers below are the same seventy lines the shell suites each carry a
 * private copy of. Three copies of them would be three places for the layer parser to drift.
 *
 * ── Why the components are called instead of rendered ───────────────────────────────────────
 *
 * CLR-003 keeps this package at `node` with no DOM, so nothing here renders: a React function
 * component is a plain function returning a plain object, and calling it asserts the tree it
 * builds (`card.test.ts`, `footer.test.ts`). Calling it at all is also the FR-024 assertion —
 * a component that grew a hook throws outside a renderer and fails every case below. What this
 * cannot prove is that a browser paints three columns at 1440; that is the LCP/Playwright work
 * of feature 003, and the cascade is read from the text here.
 */

const CARD_SOURCE = fileURLToPath(new URL('../src/components/CardProjeto.tsx', import.meta.url))
const EMPTY_SOURCE = fileURLToPath(new URL('../src/components/EmptyState.tsx', import.meta.url))
const GRID_SOURCE = fileURLToPath(new URL('../src/components/ListingGrid.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-002, FR-027). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** The design targets a `.tsx` stylesheet may name. 390 is the base layer, never a query. */
const WIDE_TARGETS = new Set(['834', '1440'])

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly className?: string
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

/** Every element in the tree, depth-first, the root included. */
function tree(root: ReactNode): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (!isValidElement(node)) return
    const element = node as AnyElement
    found.push(element)
    visit(element.props.children)
  }
  visit(root)
  return found
}

/** The text a subtree prints, in document order. */
function textOf(root: ReactNode): string {
  const parts: string[] = []
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child as ReactNode)
      return
    }
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node))
      return
    }
    if (isValidElement(node)) visit((node as AnyElement).props.children)
  }
  visit(root)
  return parts.join(' ')
}

function classesOf(element: AnyElement): string[] {
  return (element.props.className ?? '').split(/\s+/).filter((name) => name !== '')
}

/** The first element carrying `className`, e.g. the media box or the action anchor. */
function byClass(root: ReactNode, className: string): AnyElement {
  const found = tree(root).find((element) => classesOf(element).includes(className))
  expect(found, `the tree must carry an element classed .${className}`).toBeDefined()
  return found as AnyElement
}

function elementsOfType(root: ReactNode, type: string): AnyElement[] {
  return tree(root).filter((element) => element.type === type)
}

/** The stylesheet the component ships with itself, read out of its own tree. */
function styleText(root: ReactNode): string {
  const styles = elementsOfType(root, 'style')
  expect(styles, 'the rules must travel with the component, as one <style>').toHaveLength(1)
  const children = (styles[0] as AnyElement).props.children
  return (Array.isArray(children) ? children : [children]).join('').replace(/\/\*[\s\S]*?\*\//g, '')
}

interface Layer {
  /** The media condition, or `null` for the base (mobile-first) layer. */
  readonly condition: string | null
  readonly css: string
}

/**
 * The stylesheet split into its base layer and one layer per `@media` block.
 *
 * Brace-counted rather than regexed, for the reason `footer.test.ts` records: a lazy
 * `[\s\S]*?}` stops at the first inner `}` and hands back a truncated block, so every
 * "revealed at 834" assertion would pass or fail on where a brace happened to land.
 */
function layers(css: string): Layer[] {
  const found: Layer[] = []
  let base = ''
  let cursor = 0
  while (cursor < css.length) {
    const at = css.indexOf('@media', cursor)
    if (at === -1) {
      base += css.slice(cursor)
      break
    }
    base += css.slice(cursor, at)
    const open = css.indexOf('{', at)
    expect(open, `@media with no block: ${css.slice(at, at + 40)}`).toBeGreaterThan(-1)
    let depth = 0
    let end = open
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1
      else if (css[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    expect(depth, `unbalanced @media block: ${css.slice(at, at + 40)}`).toBe(0)
    found.push({ condition: css.slice(at + '@media'.length, open).trim(), css: css.slice(open + 1, end) })
    cursor = end + 1
  }
  return [{ condition: null, css: base }, ...found]
}

function layerAt(css: string, condition: string | null): Layer {
  const match = layers(css).filter((layer) => layer.condition === condition)
  expect(match, `no layer for ${condition ?? 'the base'}`).toHaveLength(1)
  return match[0] as Layer
}

/** Every declaration a layer makes for a selector mentioning `className`. Last wins, as the
 *  cascade resolves it at equal specificity. */
function declarationsFor(layer: Layer, className: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const rule of layer.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((one) => one.trim())
    if (!selectors.some((one) => new RegExp(`\\.${className}(?![\\w-])`).test(one))) continue
    for (const declaration of (rule[2] ?? '').matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)/g)) {
      found.set(declaration[1] as string, (declaration[2] ?? '').trim())
    }
  }
  return found
}

/** The `:focus-visible` block for a class, as one string — the FR-023 ring lives there. */
function focusRuleFor(css: string, className: string): string {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) =>
    new RegExp(`\\.${className}(?![\\w-]):focus-visible`).test(rule[1] ?? ''),
  )
  expect(rules, `.${className} must declare a :focus-visible ring (FR-023, SC-009)`).toHaveLength(1)
  return (rules[0]?.[2] ?? '').trim()
}

/**
 * The cover art, passed in rather than built here: `PixelImage` owns the integer scale clamp
 * (SC-008) and the app owns `next/image`, so the card must pass the caller's node through
 * untouched. Identity is the only assertion that proves it was not re-created or dropped.
 */
const CAPA = createElement('img', { src: '/luminaria.avif', alt: 'Luminária paramétrica' })

function cardProps(overrides: Partial<CardProjetoProps> = {}): CardProjetoProps {
  return {
    titulo: 'Luminária paramétrica',
    descricao: 'Luminária decorativa impressa em 3D com design paramétrico e encaixes precisos.',
    categoria: 'Impressão 3D',
    href: '/projetos/luminaria-parametrica',
    capa: CAPA,
    autor: { avatar: createElement('img', { src: '/avatar.png', alt: '' }), nome: 'Maria Silva', handle: 'mariasilva', nivel: 7 },
    curtidas: 32,
    ...overrides,
  }
}

function emptyProps(overrides: Partial<EmptyStateProps> = {}): EmptyStateProps {
  return {
    variant: 'vazio',
    titulo: 'Nenhum projeto encontrado.',
    descricao: 'Tente outra categoria ou limpe a busca.',
    acao: { label: 'Limpar filtros', href: '/projetos' },
    ...overrides,
  }
}

describe('CardProjeto — the card the mockups draw (FR-004)', () => {
  it('places the caller’s cover art at the top, untouched', () => {
    const card = CardProjeto(cardProps())
    const media = byClass(card, 'fl-card-projeto__media')
    expect(tree(media)).toContain(CAPA)
    // "sangrada de borda a borda": the card clips, so the photo can reach the rounded corner.
    expect(declarationsFor(layerAt(styleText(card), null), 'fl-card-projeto').get('overflow')).toBe('hidden')
  })

  it('shows the photo at 16:9 on the phone and ~3:2 from the tablet up', () => {
    // Two different measurements from two sections of the page spec, not one rounded average:
    // § mobile says "foto em 16:9", § desktop "proporção medida no mockup ~3:2".
    const css = styleText(CardProjeto(cardProps()))
    expect(declarationsFor(layerAt(css, null), 'fl-card-projeto__media').get('aspect-ratio')).toBe('16 / 9')
    expect(
      declarationsFor(layerAt(css, '(min-width: 834px)'), 'fl-card-projeto__media').get('aspect-ratio'),
    ).toBe('3 / 2')
  })

  it('overlays the category chip on the photo, in the themed accent on navy', () => {
    const card = CardProjeto(cardProps())
    const media = byClass(card, 'fl-card-projeto__media')
    // Overlaid on the PHOTO, not stacked above it: a chip that is merely the next sibling
    // renders as a label in the body and reads as a different design.
    expect(textOf(media)).toContain('Impressão 3D')
    const chip = declarationsFor(layerAt(styleText(card), null), 'fl-card-projeto__categoria')
    expect(chip.get('position')).toBe('absolute')
    // CLR-001: `--color-rosa-raw` paints the same pink for CITe and follows no organization.
    expect(chip.get('background')).toBe('var(--color-primary)')
    expect(chip.get('color')).toBe('var(--color-navy)')
    // "texto navy em caps" — the caps are the cascade's, so the category name stays as the CMS
    // stores it in the accessible name and in a copied string.
    expect(chip.get('text-transform')).toBe('uppercase')
    expect(textOf(card)).not.toContain('IMPRESSÃO 3D')
  })

  it('sets the title in display caps, as a heading, from the data as stored', () => {
    const card = CardProjeto(cardProps())
    const heading = elementsOfType(card, 'h3')
    expect(heading, 'the card title must be a heading, not a styled span').toHaveLength(1)
    expect(textOf(heading[0] as AnyElement)).toContain('Luminária paramétrica')
    const style = declarationsFor(layerAt(styleText(card), null), 'fl-card-projeto__titulo')
    expect(style.get('font-family')).toBe('var(--font-display)')
    expect(style.get('text-transform')).toBe('uppercase')
  })

  it('clamps the description to the two lines the mockup draws', () => {
    const card = CardProjeto(cardProps())
    expect(textOf(card)).toContain('encaixes precisos.')
    const style = declarationsFor(layerAt(styleText(card), null), 'fl-card-projeto__descricao')
    expect(style.get('-webkit-line-clamp')).toBe('2')
    expect(style.get('overflow')).toBe('hidden')
  })

  it('prints the author as name, handle and level, below a divider', () => {
    const card = CardProjeto(cardProps())
    const rodape = byClass(card, 'fl-card-projeto__rodape')
    const text = textOf(rodape)
    expect(text).toContain('Maria Silva')
    // Round 4 (2026-08-24): the identifier is `@nomesobrenome`, derived from the name.
    expect(text).toContain('@mariasilva')
    expect(text).toContain('Nível 7')
    // "rodapé do card (separado por linha divisória)".
    expect(declarationsFor(layerAt(styleText(card), null), 'fl-card-projeto__rodape').get('border-top'))
      .toMatch(/^1px solid /)
  })

  it('never doubles an `@` a CMS field already carries', () => {
    // The same idempotence `Card.formatHandle` exists for: `@@mariasilva` is the kind of defect
    // that ships because it reads as a data problem in review.
    // Written out rather than spread over `cardProps().autor`: T030 made `CardProjetoAutor` a
    // union, and spreading it produces `{ removido: true, handle }` as one arm — a removed
    // author wearing a handle, which is the literal the union exists to reject (CLR-003).
    const autor = { nome: 'Maria Silva', handle: '@mariasilva', nivel: 7 } as const
    const card = CardProjeto(cardProps({ autor }))
    expect(textOf(card)).toContain('@mariasilva')
    expect(textOf(card)).not.toContain('@@')
  })

  it('shows the like count to everyone, with the heart hidden from screen readers', () => {
    const card = CardProjeto(cardProps())
    const curtidas = byClass(card, 'fl-card-projeto__curtidas')
    expect(textOf(curtidas)).toContain('32')
    // FR-015 shows the count to everyone; "♥" alone is announced as "black heart suit" or
    // skipped entirely, so the heart is decoration and the word carries the meaning.
    const heart = tree(curtidas).find((element) => textOf(element).trim() === '♥')
    expect(heart?.props['aria-hidden'], 'the ♥ glyph is decoration beside a labelled count').toBe(true)
    expect(textOf(curtidas)).toContain('curtidas')
  })

  it('takes the like island as a slot rather than becoming one (FR-015, FR-024)', () => {
    // The heart that CHANGES the count is `LikeButton`, a client component this task does not
    // create. If the card rendered it, every listing would ship a client boundary per card —
    // the exact failure FR-024 names. So the island is composed in, and the static count is
    // what a card without one shows.
    const island = createElement('button', { type: 'button' }, '♥ 32')
    const card = CardProjeto(cardProps({ curtir: island }))
    expect(tree(card)).toContain(island)
    expect(tree(card).some((element) => classesOf(element).includes('fl-card-projeto__curtidas'))).toBe(false)
  })

  it('makes the arrow the one link, and names the project in it', () => {
    const card = CardProjeto(cardProps())
    const anchors = elementsOfType(card, 'a')
    // Exactly one: a title link and an arrow link to the same href are two tab stops with the
    // same destination, which is noise for a keyboard and a screen reader alike.
    expect(anchors).toHaveLength(1)
    const arrow = anchors[0] as AnyElement
    expect(arrow.props['href']).toBe('/projetos/luminaria-parametrica')
    // "Ver projeto" alone repeats twelve times per page with no way to tell them apart.
    expect(String(arrow.props['aria-label'] ?? '')).toContain('Luminária paramétrica')
    expect(textOf(arrow).trim()).toBe('→')
  })

  it('gives the arrow a 44px target and a visible focus ring (FR-022, FR-023)', () => {
    const css = styleText(CardProjeto(cardProps()))
    const arrow = declarationsFor(layerAt(css, null), 'fl-card-projeto__seta')
    expect(arrow.get('min-width')).toBe('44px')
    expect(arrow.get('min-height')).toBe('44px')
    // projetos.md § Estados: "Foco sempre visível via outline de 2px (WCAG AA)".
    expect(focusRuleFor(css, 'fl-card-projeto__seta')).toMatch(/outline:\s*2px solid var\(--color-/)
  })

  it('draws the surface from tokens: thin light outline, navy fill, soft corners', () => {
    const surface = declarationsFor(layerAt(styleText(CardProjeto(cardProps())), null), 'fl-card-projeto')
    expect(surface.get('border')).toBe('1px solid var(--color-claro)')
    expect(surface.get('background')).toBe('var(--color-navy)')
    expect(surface.get('border-radius')).toBe('var(--radius-md)')
  })
})

describe('EmptyState — the light surface (FR-028, FR-006)', () => {
  /**
   * The other half of `apps/web/tests/public/aulas-page.test.ts` § "asks every surface-aware
   * component for its light variant": that file proves the page ASKS, this one proves the ask
   * is worth something.
   *
   * The defect it closes: `EMPTY_STATE_CSS` declared `color: var(--color-claro)` with no
   * variant at all, and a class rule beats the `color: var(--text-on-light)` a light page sets
   * on its `<main>`. On `/aulas` and `/biblioteca-3d` that put #DCE7E3 on #FFFFFF — **1.27:1**
   * — across the entire message of both the empty and the error state, while the pink action
   * button beside it kept its navy label, so the block still read as a state. `SearchInput`
   * and `Pagination` already took a `surface` prop; this was the one shared component that did
   * not, and it was dropped onto both light pages unchanged.
   */
  const rootClass = (props: Partial<EmptyStateProps>): string =>
    String(byClass(EmptyState(emptyProps(props)), 'fl-empty-state').props['className'] ?? '')

  it('defaults to the navy surface, where the base ink is right', () => {
    expect(rootClass({})).not.toContain('fl-empty-state--light')
  })

  it('carries the light modifier when asked for it', () => {
    const className = rootClass({ surface: 'light' })
    expect(className, 'the light surface changed nothing about the element').toContain(
      'fl-empty-state--light',
    )
    expect(
      className,
      'the modifier replaced the base class rather than joining it, so every rule that is not ' +
        'a colour — the layout, the centring, the focus ring — is gone with it',
    ).toContain('fl-empty-state')
  })

  it('re-declares the ink and the ornament under that modifier, and nothing else', () => {
    // Scoped to the modifier block, because the BASE rule must keep `claro`: it is correct on
    // the navy pages, which are most of the product. Asserting its absence would be asserting
    // the wrong thing — the question is whether a light page has something that beats it.
    const block = /\.fl-empty-state--light\s*\{([^}]*)\}/.exec(EMPTY_STATE_CSS)?.[1] ?? ''
    expect(block, 'no rule targets the light modifier at all').not.toBe('')
    expect(
      block,
      'the light surface does not re-declare `color`, so the base rule still wins and the ' +
        'modifier is decoration',
    ).toMatch(/color:\s*var\(--color-navy\)/)

    const ornament =
      /\.fl-empty-state--light\s+\.fl-empty-state__ornamento\s*\{([^}]*)\}/.exec(EMPTY_STATE_CSS)?.[1] ?? ''
    expect(
      ornament,
      'the ornament keeps --color-teal on white: 2.32:1, and it is the one element of the ' +
        'state that carries no text to fall back on',
    ).toMatch(/color:\s*var\(--color-azul\)/)
  })

  it('uses only pairs the contrast fence has scored', () => {
    // navy-on-claro and azul-on-claro are both in DOCUMENTED_PAIRS at `small`. The light page
    // is #FFFFFF, which is LIGHTER than `claro` — so a dark ink that passes on claro passes on
    // white by a wider margin, and scoring against claro is the conservative direction.
    for (const fg of ['navy', 'azul'] as const) {
      expect(
        DOCUMENTED_PAIRS.some((pair) => pair.fg === fg && pair.bg === 'claro'),
        `${fg} on a light surface is not a documented pair, so nothing has scored it`,
      ).toBe(true)
    }
  })
})

describe('EmptyState — the defined empty and error bodies (FR-017, FR-018)', () => {
  it('prints the copy the listing gives it, with the ornament the mockup calls for', () => {
    const state = EmptyState(emptyProps())
    const text = textOf(state)
    expect(text).toContain('Nenhum projeto encontrado.')
    expect(text).toContain('Tente outra categoria ou limpe a busca.')
    // "com ornamento isométrico". Asserted as an `IsoShape` ELEMENT, not as an `<svg>`: nothing
    // here renders, so a nested component is a node of type `IsoShape` and is never expanded
    // (`Card.tsx` records the same constraint). Untitled is the assertion that carries the
    // accessibility decision — `IsoShape` hides a shape with no `title` from assistive
    // technology, and an ornament announced as "image" is worse than silence.
    const ornament = tree(state).filter((element) => element.type === IsoShape)
    expect(ornament, 'the empty body carries the isometric ornament').toHaveLength(1)
    expect((ornament[0] as AnyElement).props['title']).toBeUndefined()
  })

  it('clears the filters through a link, not a button (FR-017, FR-024)', () => {
    // Clearing the filters IS a URL — the one without the query. A <button> would need a
    // handler, a handler needs `'use client'`, and the listing would ship a client boundary
    // for a control that is an anchor.
    const anchors = elementsOfType(EmptyState(emptyProps()), 'a')
    expect(anchors).toHaveLength(1)
    expect((anchors[0] as AnyElement).props['href']).toBe('/projetos')
    expect(textOf(anchors[0] as AnyElement)).toContain('Limpar filtros')
    expect(elementsOfType(EmptyState(emptyProps()), 'button')).toHaveLength(0)
  })

  it('wears the canonical primary style rather than restating it', () => {
    // projetos.md: "todo botão primário desta página (… `LIMPAR FILTROS`, `TENTAR NOVAMENTE` …)
    // usa o estilo canônico do site". Reading the exported object is what makes that one
    // decision instead of two that drift.
    const anchor = elementsOfType(EmptyState(emptyProps()), 'a')[0] as AnyElement
    expect(anchor.props.style).toMatchObject(PRIMARY_BUTTON_STYLE as Record<string, unknown>)
  })

  it('retries an error through its own copy and action (FR-018)', () => {
    const state = EmptyState(
      emptyProps({
        variant: 'erro',
        titulo: 'Não foi possível carregar os projetos.',
        descricao: undefined,
        acao: { label: 'Tentar novamente', href: '/projetos?pagina=1' },
      }),
    )
    expect(textOf(state)).toContain('Não foi possível carregar os projetos.')
    expect((elementsOfType(state, 'a')[0] as AnyElement).props['href']).toBe('/projetos?pagina=1')
    // A failure is announced; an empty result is ordinary content and must not be.
    expect(byClass(state, 'fl-empty-state').props['role']).toBe('alert')
    expect(byClass(EmptyState(emptyProps()), 'fl-empty-state').props['role']).toBeUndefined()
  })

  it('renders no empty paragraph when the listing gives no second line', () => {
    // "um documento cujas partes opcionais estão vazias renderiza sem elas, em vez de exibir
    // títulos vazios" (US10's edge, applied to the state that reports there is nothing).
    const state = EmptyState(emptyProps({ descricao: undefined }))
    expect(elementsOfType(state, 'p')).toHaveLength(0)
  })

  it('gives the action a visible focus ring (FR-023, SC-009)', () => {
    expect(focusRuleFor(styleText(EmptyState(emptyProps())), 'fl-empty-state__acao'))
      .toMatch(/outline:\s*2px solid var\(--color-/)
  })
})

describe('ListingGrid — the 3/2/1 chrome every listing shares (FR-004, FR-021)', () => {
  it('is one column at 390, two from 834 and three from 1440', () => {
    const css = styleText(ListingGrid({ label: 'Projetos', children: [] }))
    const columns = (condition: string | null): string | undefined =>
      declarationsFor(layerAt(css, condition), 'fl-listing-grid').get('grid-template-columns')
    expect(columns(null)).toBe('repeat(1, minmax(0, 1fr))')
    expect(columns('(min-width: 834px)')).toBe('repeat(2, minmax(0, 1fr))')
    expect(columns('(min-width: 1440px)')).toBe('repeat(3, minmax(0, 1fr))')
  })

  it('paints exactly the column counts it declares as data', () => {
    // The counts are the decision (3/2/1 in FR-004, one per design target), so they are
    // exported rather than buried in a string: a page that needs to reason about the page size
    // reads them, and this assertion is what keeps the constant and the cascade the same fact.
    expect(LISTING_GRID_COLUMNS).toEqual({ mobile: 1, tablet: 2, desktop: 3 })
    const css = styleText(ListingGrid({ label: 'Projetos', children: [] }))
    for (const count of Object.values(LISTING_GRID_COLUMNS)) {
      expect(css).toContain(`repeat(${count}, minmax(0, 1fr))`)
    }
  })

  it('keeps the gutter uniform — one gap, not a row and a column that can drift', () => {
    const base = declarationsFor(layerAt(styleText(ListingGrid({ label: 'Projetos', children: [] })), null), 'fl-listing-grid')
    expect(base.get('gap')).toMatch(/^var\(--space-\d+\)$/)
    expect(base.has('row-gap')).toBe(false)
    expect(base.has('column-gap')).toBe(false)
  })

  it('announces the cards as a labelled list, one item per child, in order', () => {
    const cards = [
      createElement('article', { key: 'a' }, 'LUMINÁRIA'),
      createElement('article', { key: 'b' }, 'CADEIRA'),
      createElement('article', { key: 'c' }, 'CAMISETA'),
    ]
    const grid = ListingGrid({ label: 'Projetos', children: cards })
    const list = elementsOfType(grid, 'ul')
    expect(list, 'twelve peers announced as "list, 12 items" is what lets a reader skip them').toHaveLength(1)
    expect((list[0] as AnyElement).props['aria-label']).toBe('Projetos')
    const items = elementsOfType(grid, 'li')
    expect(items).toHaveLength(3)
    expect(items.map((item) => textOf(item))).toEqual(['LUMINÁRIA', 'CADEIRA', 'CAMISETA'])
  })

  it('renders no list items for an empty page — the empty state is the caller’s to place', () => {
    // A grid that invented its own "nothing here" would give four listings two empty states
    // with two wordings, and FR-017 asks for one.
    expect(elementsOfType(ListingGrid({ label: 'Projetos', children: [] }), 'li')).toHaveLength(0)
  })
})

describe('the chrome stays server-rendered and token-painted (FR-024, FR-027, FR-012)', () => {
  const SOURCES = [
    ['CardProjeto', CARD_SOURCE],
    ['EmptyState', EMPTY_SOURCE],
    ['ListingGrid', GRID_SOURCE],
  ] as const

  it.each(SOURCES)('%s declares no client boundary and holds no state', (name, path) => {
    const source = readFileSync(path, 'utf8')
    expect(source, `${name} is not one of the six islands FR-024 allows`).not.toMatch(/['"]use client['"]/)
    expect(source).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback|Context)\s*\(/)
  })

  it.each(SOURCES)('%s writes no colour of its own', (name, path) => {
    const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(HEX_COLOUR.test(source), `${name} must resolve every colour through a token`).toBe(false)
    // CLR-001: the raw pink is the DEFAULT behind `--color-primary`, never an accent — it
    // renders identically for CITe and stops following the organization the moment there are two.
    expect(source).not.toContain('--color-rosa-raw')
  })

  it.each(SOURCES)('%s writes every media query mobile-first, at a design target', (name, path) => {
    const source = readFileSync(path, 'utf8')
    const queries = [...source.matchAll(/@media\s*\(([^)]*)\)/g)].map((match) => match[1] ?? '')
    for (const query of queries) {
      expect(query, `${name}: 390 is the base layer, so a query must be min-width`).toContain('min-width')
      const width = /(\d+)px/.exec(query)?.[1] ?? ''
      expect(WIDE_TARGETS, `${name} queries at ${width}px, which is not a design target`).toContain(width)
    }
  })
})
