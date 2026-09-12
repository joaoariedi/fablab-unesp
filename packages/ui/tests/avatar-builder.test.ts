import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { AvatarPreview, DIRECOES_AVATAR, proximaDirecao } from '../src/components/AvatarPreview'
import {
  AvatarBuilder,
  avatarCompleto,
  escolhasFaltando,
  SLOTS_OPCIONAIS,
  type AvatarConfig,
  type BaseAvatar,
  type ItemAvatar,
  type SlotAvatar,
  type TomAvatar,
} from '../src/components/AvatarBuilder'

/**
 * T024 / FR-003, FR-032, SC-012 — the builder island: what it offers, and what it downloads.
 *
 * Two requirements meet in this file and they pull in opposite directions.
 *
 * **FR-003** is *completeness*: base `F`/`M`, 20 skin tones, 10 hair colours and the nine item
 * slots **at the catalogue sizes**. It fails silently — Payload's default `limit` is 10, and a
 * builder that offers 10 of the 30 haircuts looks finished. The page already learnt this once
 * (`criar-conta/page.tsx` reads each collection at its own exported size), and the island is
 * the second place the catalogue can be truncated: a `.slice()` for a tidy grid, a `Set` keyed
 * on the wrong column, a filter meant for `roupaCima` applied to all nine. So the fixture below
 * is built at the **real** sizes and every slot is counted.
 *
 * **FR-032** is *cost*: this is the largest island in the product and its budget is recorded
 * rather than enforced (CLR-004), which means nothing downstream will notice it doubling. The
 * task fixes the delivery shape — *"picker sheets (one direction) up front, preview sheets
 * (four) for chosen items"*: ~93 thumbnails are drawn from the single-direction `sprite`, and
 * only the handful of items a person actually chose pull their four-frame `spriteFolhas`. An
 * implementation that reaches for `spriteFolhas ?? sprite` in the picker renders **identically**
 * — frame 0 of a four-frame sheet is the same picture, drawn at four times the bytes, 93 times
 * over. There is no visual difference to catch it, so the assertion reads the URLs.
 *
 * ── Why the hook dispatcher is faked rather than the component rendered ──────────────────────
 *
 * CLR-003 (feature 001) keeps this package at `node` with no DOM and no test renderer, so
 * calling the component and walking the tree is the only instrument available — and `useState`
 * resolves through React's current dispatcher, which is null outside a renderer.
 * `menu-sheet.test.ts` established the fake and `like-button.test.ts` extended it; this file
 * uses the narrowest version of it, because the island is allowed exactly one hook.
 *
 * What none of this can prove: that the browser paints the stack, that a press re-renders, or
 * that 93 thumbnails arrive in one sheet rather than 93 requests. Those are the workbench
 * (FR-016), feature 003's Playwright, and T039's recorded measurement.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/AvatarBuilder.tsx', import.meta.url))

/** A complete hex run, matched anywhere — the colour fence's own pattern (FR-034, CLR-005). */
const HEX_COLOUR = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})(?![0-9a-zA-Z_])/

/** Where React 19 keeps the hook dispatcher the fake below stands in for. */
const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE'

/**
 * The nine slots and **how many options each offers**, copied from `onboarding.md`
 * § *Painéis de customização* — never from `CATEGORIAS_AVATAR`, which this package may not
 * import (FR-018's purity boundary) and which would in any case make the test check that a
 * constant equals itself.
 *
 * The key order is the order the pickers are stacked in, which `AvatarItem.ts` calls
 * load-bearing and this file therefore asserts.
 */
const TAMANHOS: Readonly<Record<string, number>> = Object.freeze({
  cabelo: 30,
  olhos: 4,
  nariz: 4,
  boca: 4,
  roupaCima: 10,
  roupaBaixo: 10,
  sapatos: 10,
  oculos: 5,
  chapeu: 5,
})

const SLOTS_ORDEM = Object.keys(TAMANHOS)

/** `onboarding.md` § *Painéis*: 20 skin tones in a 4×5 grid, 10 hair colours in a row. */
const TOTAL_PELES = 20
const TOTAL_CABELOS = 10

/** The one slot that varies by base (FR-004). Ten pieces, each as an `f` and an `m` sprite. */
const SLOT_COM_BASE = 'roupaCima'

const BASES: readonly BaseAvatar[] = ['f', 'm']

/** Distinct per slot, so a layer's `camadaZ` identifies where it came from. */
const CAMADA_Z: Readonly<Record<string, number>> = Object.freeze({
  cabelo: 80,
  olhos: 40,
  nariz: 41,
  boca: 42,
  roupaCima: 60,
  roupaBaixo: 55,
  sapatos: 50,
  oculos: 85,
  chapeu: 90,
})

/** The picker art: ONE direction, and what every thumbnail must be drawn from. */
const spriteDe = (id: string): string => `/av/${id}.png`

/** The preview sheet: FOUR directions, and what only a CHOSEN item may pull. */
const folhasDe = (id: string): string => `/av/${id}-quatro.png`

function item(slot: string, id: string, base?: BaseAvatar): ItemAvatar {
  return {
    id,
    nome: `${slot} ${id}`,
    slot,
    camadaZ: CAMADA_Z[slot] ?? 0,
    sprite: spriteDe(id),
    spriteFolhas: folhasDe(id),
    ...(base ? { base } : {}),
  }
}

/** The catalogue as the page reads it: every row of `avatarItem`, the base-varying slot twice. */
const ITENS: readonly ItemAvatar[] = SLOTS_ORDEM.flatMap((slot) =>
  slot === SLOT_COM_BASE
    ? BASES.flatMap((base) =>
        Array.from({ length: TAMANHOS[slot] as number }, (_, i) =>
          item(slot, `${slot}-${base}-${i + 1}`, base),
        ),
      )
    : Array.from({ length: TAMANHOS[slot] as number }, (_, i) => item(slot, `${slot}-${i + 1}`)),
)

const SLOTS: readonly SlotAvatar[] = SLOTS_ORDEM.map((slot) => ({
  slot,
  titulo: slot.toUpperCase(),
}))

/** A palette row is `nome` + `hex`, and the hex is **data** (CLR-005) — it arrives from the
 *  database, which is why no colour literal belongs in the component. */
const tons = (prefixo: string, total: number): readonly TomAvatar[] =>
  Array.from({ length: total }, (_, i) => ({
    id: `${prefixo}-${i + 1}`,
    nome: `${prefixo} ${i + 1}`,
    hex: `#00${String(i + 10).padStart(4, '0')}`,
  }))

const PELES = tons('pele', TOTAL_PELES)
const CABELOS = tons('cabelo-tom', TOTAL_CABELOS)

const LARGURA = 32
const ALTURA = 48

/** Three chosen pieces and nothing else — enough that "only the chosen" has something to
 *  exclude, and few enough that the excluded set is the overwhelming majority. */
const ESCOLHIDOS = Object.freeze({ cabelo: 'cabelo-3', boca: 'boca-2', sapatos: 'sapatos-7' })

const CONFIG_ESCOLHIDA: AvatarConfig = {
  base: 'f',
  pele: 'pele-4',
  cabeloTom: 'cabelo-tom-2',
  itens: ESCOLHIDOS,
  direcao: 'frente',
}

type AnyElement = ReactElement<{
  readonly children?: ReactNode
  readonly style?: Record<string, unknown>
  readonly [key: string]: unknown
}>

/**
 * The one hook this island is allowed, with its state answered as asked.
 *
 * A named fake rather than an inline stub: it records every value the component pushes, which
 * is what turns "the rotation advances" and "a press records the item" into executed behaviour
 * instead of the word `setConfig` appearing in the file. A component reaching for a second kind
 * of hook fails loudly here rather than quietly becoming a bigger island than SC-012 allows.
 */
class FakeHookDispatcher {
  /** Every value handed to the setter, in call order. */
  readonly updates: unknown[] = []

  readonly useState = (initial: unknown): [unknown, (next: unknown) => void] => [
    initial,
    (next: unknown): void => {
      this.updates.push(next)
    },
  ]
}

interface Props {
  readonly inicial?: AvatarConfig
  readonly onChange?: (config: AvatarConfig) => void
  /** A catalogue other than {@link ITENS} — how the missing-art fixtures of FR-007 are mounted. */
  readonly itens?: readonly ItemAvatar[]
}

interface Mounted {
  readonly tree: AnyElement
  readonly dispatcher: FakeHookDispatcher
}

/** The component's tree with its hook answered by the fake. The dispatcher is restored even on
 *  failure — leaking a fake would break every later file in the run. */
function mount(props: Props = {}): Mounted {
  const internals = (React as unknown as Record<string, { H: unknown } | undefined>)[INTERNALS_KEY]
  expect(internals, `React no longer exposes ${INTERNALS_KEY}; this fake needs it`).toBeTypeOf(
    'object',
  )
  const shared = internals as { H: unknown }
  const dispatcher = new FakeHookDispatcher()
  const previous = shared.H
  shared.H = dispatcher
  try {
    const tree = AvatarBuilder({
      slots: SLOTS,
      itens: ITENS,
      peles: PELES,
      cabelos: CABELOS,
      larguraBase: LARGURA,
      alturaBase: ALTURA,
      alt: 'Avatar em construção',
      ...props,
    }) as AnyElement
    return { tree, dispatcher }
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

/** The elements carrying a given `data-` attribute, in tree order. */
const comAtributo = (tree: AnyElement, name: string): AnyElement[] =>
  elementsOf(tree).filter((element) => element.props[name] !== undefined)

const valoresDe = (tree: AnyElement, name: string): string[] =>
  comAtributo(tree, name).map((element) => String(element.props[name]))

/** One slot's panel, found by the slot name the catalogue and `avatarConfig` both use. */
function painel(tree: AnyElement, slot: string): AnyElement {
  const encontrado = comAtributo(tree, 'data-slot').find(
    (element) => element.props['data-slot'] === slot,
  )
  if (!encontrado) throw new Error(`no picker panel was rendered for slot "${slot}"`)
  return encontrado
}

/** The item ids one panel offers. */
const opcoesDe = (tree: AnyElement, slot: string): string[] =>
  valoresDe(painel(tree, slot), 'data-item')

/**
 * Every image source anywhere in a subtree — `<img src>` and any CSS `background-image`.
 *
 * Both, because the two routes are interchangeable to a reader and only one of them is an
 * `<img>`: `AvatarPreview` composes with backgrounds, so a picker that did the same would be
 * invisible to a src-only walk and would ship the sheets regardless.
 */
function fontesDeImagem(node: AnyElement): string[] {
  return elementsOf(node).flatMap((element) => {
    const fontes: string[] = []
    const src = element.props.src
    if (typeof src === 'string') fontes.push(src)
    const fundo = element.props.style?.backgroundImage
    if (typeof fundo === 'string') {
      for (const match of fundo.matchAll(/url\(([^)]+)\)/g)) fontes.push(match[1] as string)
    }
    return fontes
  })
}

/** One composed layer, as the preview receives it. `sprite` is read as well as the sheet: it is
 *  what a piece with no four-direction art degrades to (FR-007). */
interface CamadaLida {
  readonly slot: string
  readonly camadaZ: number
  readonly sprite?: string
  readonly spriteFolhas?: string
}

/** The `AvatarPreview` the builder renders, as an element — its props are the composition. */
function preview(tree: AnyElement): ReactElement<{
  readonly camadas?: readonly CamadaLida[]
  readonly direcao?: string
}> {
  const encontrado = elementsOf(tree).find((element) => element.type === AvatarPreview)
  if (!encontrado) throw new Error('the builder renders no AvatarPreview')
  return encontrado as ReactElement<{
    readonly camadas?: readonly CamadaLida[]
    readonly direcao?: string
  }>
}

/** Press a control: call the handler React would have called. */
function pressionar(element: AnyElement): void {
  const onClick = element.props.onClick
  expect(onClick, `the control ${String(element.props['data-item'] ?? element.key)} has no onClick`)
    .toBeTypeOf('function')
  ;(onClick as () => void)()
}

/** The control carrying `attribute === value`. */
function controle(tree: AnyElement, attribute: string, value: string): AnyElement {
  const encontrado = comAtributo(tree, attribute).find(
    (element) => String(element.props[attribute]) === value,
  )
  if (!encontrado) throw new Error(`no control found for ${attribute}="${value}"`)
  return encontrado
}

/** The last config the component pushed into its state. */
function ultimoEstado(mounted: Mounted): AvatarConfig {
  const ultimo = mounted.dispatcher.updates.at(-1)
  expect(ultimo, 'the component pushed no state update at all').toBeDefined()
  return ultimo as AvatarConfig
}

describe('AvatarBuilder — the whole catalogue is on offer (FR-003)', () => {
  it('offers both bases, F and M', () => {
    const { tree } = mount()
    expect(valoresDe(tree, 'data-base').sort()).toEqual(['f', 'm'])
  })

  it('renders one picker per slot, in the order the page declared them', () => {
    // The order is `CATEGORIAS_AVATAR`'s, which calls itself "the order the builder stacks its
    // pickers in". A builder that groups by `camadaZ`, or that walks the item rows instead of
    // the declared slots, renders a screen nobody designed.
    expect(valoresDe(mount().tree, 'data-slot')).toEqual(SLOTS_ORDEM)
  })

  it('offers every option of every slot, at the catalogue sizes', () => {
    const { tree } = mount()
    const oferecido = Object.fromEntries(
      SLOTS_ORDEM.map((slot) => [slot, opcoesDe(tree, slot).length]),
    )
    // The whole of FR-003's second half. Payload's default limit is 10: a builder that offered
    // ten haircuts would look finished, and the only thing that can tell is a count.
    expect(oferecido).toEqual(TAMANHOS)
  })

  it('offers the chosen base of the one slot that varies by base (FR-004)', () => {
    const daBase = (base: BaseAvatar): string[] =>
      opcoesDe(mount({ inicial: { ...CONFIG_ESCOLHIDA, base } }).tree, SLOT_COM_BASE)
    // Ten pieces are offered either way, and they are ten DIFFERENT rows: the table holds
    // twenty. Offering all twenty would show each top twice; offering the wrong ten dresses
    // every avatar in the other base's sprites.
    expect(daBase('f').every((id) => id.includes('-f-'))).toBe(true)
    expect(daBase('m').every((id) => id.includes('-m-'))).toBe(true)
    expect(daBase('f')).not.toEqual(daBase('m'))
  })

  it('leaves the other eight slots alone when the base changes (FR-004)', () => {
    const semBase = (base: BaseAvatar): Record<string, string[]> => {
      const { tree } = mount({ inicial: { ...CONFIG_ESCOLHIDA, base } })
      return Object.fromEntries(
        SLOTS_ORDEM.filter((slot) => slot !== SLOT_COM_BASE).map((slot) => [
          slot,
          opcoesDe(tree, slot),
        ]),
      )
    }
    // "trocar entre F e M altera **apenas** a variante da PARTE DE CIMA" — a `base` filter
    // applied to every slot empties the other eight, because only `roupaCima` carries one.
    expect(semBase('m')).toEqual(semBase('f'))
  })

  it('offers every skin tone and every hair colour it was handed', () => {
    const { tree } = mount()
    expect(valoresDe(tree, 'data-tom-pele')).toHaveLength(TOTAL_PELES)
    expect(valoresDe(tree, 'data-tom-cabelo')).toHaveLength(TOTAL_CABELOS)
  })
})

describe('picker art up front, preview sheets only for the chosen (FR-032)', () => {
  const SPRITES = new Set(ITENS.map((i) => spriteDe(i.id)))
  const FOLHAS = new Set(ITENS.map((i) => folhasDe(i.id)))

  it('draws every thumbnail from the single-direction sprite', () => {
    const { tree } = mount({ inicial: CONFIG_ESCOLHIDA })
    const fontes = SLOTS_ORDEM.flatMap((slot) => fontesDeImagem(painel(tree, slot)))
    // Non-vacuity first: a picker that drew no art at all would satisfy every "never a sheet"
    // assertion below while showing the person a wall of names.
    expect(fontes.length).toBeGreaterThanOrEqual(Object.values(TAMANHOS).reduce((a, b) => a + b, 0))
    expect(fontes.filter((fonte) => !SPRITES.has(fonte))).toEqual([])
  })

  it('pulls no four-direction sheet into a picker — the bytes FR-032 refuses', () => {
    const { tree } = mount({ inicial: CONFIG_ESCOLHIDA })
    const fontes = SLOTS_ORDEM.flatMap((slot) => fontesDeImagem(painel(tree, slot)))
    // `spriteFolhas ?? sprite` renders an identical picture at four times the bytes, ~93 times
    // over. Nothing on screen differs, so the URL is the only evidence there is.
    expect(fontes.filter((fonte) => FOLHAS.has(fonte))).toEqual([])
  })

  it('hands the preview the four-direction sheet of each chosen item', () => {
    const camadas = preview(mount({ inicial: CONFIG_ESCOLHIDA }).tree).props.camadas ?? []
    expect(camadas.map((camada) => camada.slot).sort()).toEqual(Object.keys(ESCOLHIDOS).sort())
    for (const [slot, id] of Object.entries(ESCOLHIDOS)) {
      const camada = camadas.find((c) => c.slot === slot)
      expect(camada?.spriteFolhas, `slot ${slot} reached the preview without its sheet`).toBe(
        folhasDe(id),
      )
      // `camadaZ` comes from the catalogue row, never from the slot's position in the picker
      // list: the composition order is `AvatarPreview`'s promise and it reads this number.
      expect(camada?.camadaZ).toBe(CAMADA_Z[slot])
    }
  })

  it('composes no layer for a slot nobody has chosen', () => {
    // The optional accessories are the visible case (FR-005), but the rule is broader: an
    // unchosen slot has no item, and inventing one would put a default haircut on a person who
    // never picked it — and would load its sheet.
    const camadas = preview(mount().tree).props.camadas ?? []
    expect(camadas).toEqual([])
  })
})

describe('the direction the island holds, and the preview draws (FR-006)', () => {
  it('hands the preview the direction it is holding', () => {
    for (const direcao of DIRECOES_AVATAR) {
      const { tree } = mount({ inicial: { ...CONFIG_ESCOLHIDA, direcao } })
      expect(preview(tree).props.direcao).toBe(direcao)
    }
  })

  it('advances one step per press, through all four directions', () => {
    for (const direcao of DIRECOES_AVATAR) {
      const mounted = mount({ inicial: { ...CONFIG_ESCOLHIDA, direcao } })
      pressionar(controle(mounted.tree, 'data-rotacao', 'proxima'))
      // The rule lives in `AvatarPreview`'s exported `proximaDirecao`; the island only holds
      // which step it is on. A private copy here is how the button and the sheet come to
      // disagree about which way the avatar turns.
      expect(ultimoEstado(mounted).direcao).toBe(proximaDirecao(direcao))
    }
  })
})

describe('a press changes the configuration, and the page is told (FR-003, US2)', () => {
  it('records the chosen item in its slot', () => {
    const mounted = mount({ inicial: CONFIG_ESCOLHIDA })
    pressionar(controle(mounted.tree, 'data-item', 'oculos-4'))
    expect(ultimoEstado(mounted).itens).toEqual({ ...ESCOLHIDOS, oculos: 'oculos-4' })
  })

  it('records the skin tone, the hair colour and the base', () => {
    const mounted = mount({ inicial: CONFIG_ESCOLHIDA })
    pressionar(controle(mounted.tree, 'data-tom-pele', 'pele-11'))
    expect(ultimoEstado(mounted).pele).toBe('pele-11')
    pressionar(controle(mounted.tree, 'data-tom-cabelo', 'cabelo-tom-9'))
    expect(ultimoEstado(mounted).cabeloTom).toBe('cabelo-tom-9')
    pressionar(controle(mounted.tree, 'data-base', 'm'))
    expect(ultimoEstado(mounted).base).toBe('m')
  })

  it('tells the page every change, so step 2 can carry the avatar (FR-002)', () => {
    const vistos: AvatarConfig[] = []
    const mounted = mount({ inicial: CONFIG_ESCOLHIDA, onChange: (c) => vistos.push(c) })
    pressionar(controle(mounted.tree, 'data-item', 'chapeu-1'))
    // `VOLTAR` on step 2 must find the avatar intact, and the only way the shell can hold it is
    // if the island says what it became. A builder that only writes its own state is a screen
    // whose work is lost at the first navigation.
    expect(vistos).toEqual([ultimoEstado(mounted)])
  })

  it('marks what is selected without relying on colour alone', () => {
    const { tree } = mount({ inicial: CONFIG_ESCOLHIDA })
    // `onboarding.md` draws selection as a yellow outline. An outline is invisible to a screen
    // reader and to anyone who cannot separate the two colours, so the state is also announced.
    const escolhido = controle(tree, 'data-item', ESCOLHIDOS.cabelo)
    const outro = controle(tree, 'data-item', 'cabelo-4')
    expect(escolhido.props['aria-pressed']).toBe(true)
    expect(outro.props['aria-pressed']).toBe(false)
  })
})

describe('the island pays the colour fence and stays one hook wide (FR-034, SC-012)', () => {
  it('writes no colour literal — the palettes are data, not tokens (CLR-005)', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    // The skin and hair `hex` values arrive from the database (CLR-005). A literal here would
    // be a colour nobody can theme and a fence violation `colour-fence.test.ts` scores.
    expect(HEX_COLOUR.test(source), 'a hex colour literal is in the builder').toBe(false)
  })
})

/**
 * T024b / FR-005, FR-007, US2 — when step 1 may finish, and what a missing sprite costs.
 *
 * Two rules that only look unrelated. FR-005 decides when `SALVAR E CONTINUAR` may be pressed;
 * FR-007 decides what happens when the art behind a choice is not there. They meet on one
 * sentence of US2 — *"a missing accessory sprite must not block an account being created"* —
 * which is a rule about the **gate**, not about the picture: an implementation that decides
 * completeness by asking whether each chosen piece has a drawable sprite passes every visual
 * check and locks a person out of signup on the day a file 404s.
 *
 * So the predicate is handed the configuration and the declared slots, and **never the
 * catalogue**. That is the whole of FR-007 on this path, and it is why the fixtures below strip
 * art from rows that are still chosen: the avatar stays complete, the layer stays composed, and
 * only the one slot loses its picture.
 *
 * Why the palettes count as requirements: `onboarding.md` § `avatar_config` writes the stored
 * shape as *"`base`, `tom_pele`, `tom_cabelo`, and one item per slot: … `oculos?`, `chapeu?`"*.
 * The two question marks are the whole of FR-005's optionality, and neither palette carries one.
 *
 * What this file still cannot prove: that the page's submit button is actually wired to the
 * predicate. That is `signup-navigation.test.ts` (T026b) and the end-to-end at T028.
 */

/** FR-005's own words — *"`oculos` and `chapeu` are optional"* — retyped from the requirement
 *  rather than read from the export under test, which would assert that a constant equals itself. */
const OPCIONAIS_DA_FR005: readonly string[] = ['oculos', 'chapeu']

/** *"every other slot is required before step 1 completes"*: the other seven, in panel order. */
const SLOTS_OBRIGATORIOS = SLOTS_ORDEM.filter((slot) => !OPCIONAIS_DA_FR005.includes(slot))

/** The first option a slot offers. `roupaCima` is the one whose ids carry a base (FR-004). */
const primeiroDoSlot = (slot: string): string =>
  slot === SLOT_COM_BASE ? `${slot}-f-1` : `${slot}-1`

/** Every required slot filled and **neither accessory chosen** — the US2 edge, as a value. */
const CONFIG_COMPLETA: AvatarConfig = {
  base: 'f',
  pele: 'pele-1',
  cabeloTom: 'cabelo-tom-1',
  itens: Object.fromEntries(SLOTS_OBRIGATORIOS.map((slot) => [slot, primeiroDoSlot(slot)])),
  direcao: 'frente',
}

/** The opening state the mockup draws: base `F`, facing front, nothing else chosen. */
const CONFIG_VAZIA: AvatarConfig = { base: 'f', itens: {}, direcao: 'frente' }

/** The complete avatar with one slot emptied again. */
const semOSlot = (slot: string): AvatarConfig => ({
  ...CONFIG_COMPLETA,
  itens: Object.fromEntries(Object.entries(CONFIG_COMPLETA.itens).filter(([s]) => s !== slot)),
})

/** The complete avatar with one more slot chosen — used for the two optional ones. */
const comOSlot = (slot: string): AvatarConfig => ({
  ...CONFIG_COMPLETA,
  itens: { ...CONFIG_COMPLETA.itens, [slot]: primeiroDoSlot(slot) },
})

/** The same catalogue row with **no art at all**: a piece whose sprite the CMS never received,
 *  or whose file 404s. `AvatarItem.ts` declares only `sprite` required for exactly this reason. */
const semArte = (linha: ItemAvatar): ItemAvatar => ({
  id: linha.id,
  nome: linha.nome,
  slot: linha.slot,
  camadaZ: linha.camadaZ,
  ...(linha.base ? { base: linha.base } : {}),
})

/** The catalogue with one slot's art removed and every other row untouched — the fixture that
 *  makes *"that slot only"* falsifiable. */
const catalogoSemArteEm = (slot: string): readonly ItemAvatar[] =>
  ITENS.map((linha) => (linha.slot === slot ? semArte(linha) : linha))

/** The catalogue with one row keeping its picker sprite but losing its four-direction sheet. */
const catalogoSemFolhasEm = (id: string): readonly ItemAvatar[] =>
  ITENS.map((linha) =>
    linha.id === id ? { ...semArte(linha), sprite: spriteDe(linha.id) } : linha,
  )

describe('what step 1 requires before it may finish (FR-005)', () => {
  it('exports a completeness rule at all', () => {
    // The guard the rest of this describe depends on: without it, every `expect(...)` below
    // would fail with "is not a function" and say nothing about which rule is missing.
    expect(SLOTS_OPCIONAIS, 'FR-005 names two optional slots; the module names none').toBeDefined()
    expect(avatarCompleto).toBeTypeOf('function')
    expect(escolhasFaltando).toBeTypeOf('function')
  })

  it('makes `oculos` and `chapeu` optional, and nothing else', () => {
    expect([...SLOTS_OPCIONAIS].sort()).toEqual([...OPCIONAIS_DA_FR005].sort())
  })

  it('calls an avatar with no accessories complete — US2s edge, and the reason FR-005 exists', () => {
    // "they choose no optional accessory — the avatar is complete and SALVAR E CONTINUAR is
    // enabled". A gate written as "nine slots filled" fails exactly here, and fails for the
    // person who liked their avatar without a hat.
    expect(escolhasFaltando(CONFIG_COMPLETA, SLOTS)).toEqual([])
    expect(avatarCompleto(CONFIG_COMPLETA, SLOTS)).toBe(true)
  })

  it.each(SLOTS_OBRIGATORIOS)('refuses to finish while %s is empty, and names it', (slot) => {
    const config = semOSlot(slot)
    expect(avatarCompleto(config, SLOTS)).toBe(false)
    // Named, not merely counted: the person has to be told which panel to go back to, and a
    // boolean alone cannot say it.
    expect(escolhasFaltando(config, SLOTS)).toEqual([slot])
  })

  it.each(OPCIONAIS_DA_FR005)('finishes whether or not %s was chosen', (slot) => {
    expect(avatarCompleto(comOSlot(slot), SLOTS)).toBe(true)
    expect(escolhasFaltando(comOSlot(slot), SLOTS)).toEqual([])
  })

  it('requires the skin tone and the hair colour — neither carries `avatar_config`s `?`', () => {
    expect(escolhasFaltando({ ...CONFIG_COMPLETA, pele: undefined }, SLOTS)).toEqual(['pele'])
    expect(escolhasFaltando({ ...CONFIG_COMPLETA, cabeloTom: undefined }, SLOTS)).toEqual([
      'cabeloTom',
    ])
  })

  it('names every unmet requirement of the opening state, in the order they are on screen', () => {
    // Nine names from an untouched builder: the two palettes, then the seven required slots in
    // the order the panels are stacked in. The non-vacuity guard for every assertion above —
    // a predicate that answered `[]` to everything would satisfy all of them but this one.
    expect(escolhasFaltando(CONFIG_VAZIA, SLOTS)).toEqual([
      'cabeloTom',
      'pele',
      ...SLOTS_OBRIGATORIOS,
    ])
    expect(avatarCompleto(CONFIG_VAZIA, SLOTS)).toBe(false)
  })

  it('asks only about the slots it was handed, so a shorter catalogue is not a locked door', () => {
    // The declared slots are the page's (`CATEGORIAS_AVATAR`), and a lab whose builder offered
    // fewer panels must not gate on a panel nobody can see. The rule reads the argument, never
    // a list of nine copied into this package.
    const dois = SLOTS.filter(({ slot }) => slot === 'cabelo' || slot === 'chapeu')
    expect(escolhasFaltando({ ...CONFIG_VAZIA, pele: 'pele-1', cabeloTom: 'cabelo-tom-1' }, dois))
      .toEqual(['cabelo'])
  })
})

describe('a sprite that fails to load costs that slot and nothing else (FR-007)', () => {
  it('still lets the account be created — completeness never asks whether the art exists', () => {
    const semNenhumaArte = ITENS.map(semArte)
    const { tree } = mount({ inicial: CONFIG_COMPLETA, itens: semNenhumaArte })
    // The whole catalogue has lost its pictures. Every panel is still offered, every option is
    // still there, and the avatar is still complete: US2s *"a missing accessory sprite must not
    // block an account being created"*, at the widest scale the failure can take.
    expect(valoresDe(tree, 'data-slot')).toEqual(SLOTS_ORDEM)
    expect(valoresDe(tree, 'data-item')).toHaveLength(valoresDe(mount().tree, 'data-item').length)
    expect(avatarCompleto(CONFIG_COMPLETA, SLOTS)).toBe(true)
  })

  it('degrades the one slot with no art, and leaves the other eight drawing', () => {
    const { tree } = mount({ inicial: CONFIG_COMPLETA, itens: catalogoSemArteEm('cabelo') })
    // Nothing is drawn for the broken slot — and nothing half-drawn either: an `img` with an
    // absent `src` is the browsers broken-image glyph, thirty times over.
    expect(fontesDeImagem(painel(tree, 'cabelo'))).toEqual([])
    expect(
      elementsOf(painel(tree, 'cabelo')).filter(
        (el) => 'src' in el.props && typeof el.props.src !== 'string',
      ),
    ).toEqual([])
    // "that slot only": the neighbours are untouched, art and all.
    expect(fontesDeImagem(painel(tree, 'olhos'))).toHaveLength(TAMANHOS.olhos as number)
  })

  it('keeps the artless slot usable — its options are named and still record a choice', () => {
    const mounted = mount({ inicial: CONFIG_COMPLETA, itens: catalogoSemArteEm('cabelo') })
    // The mockups fallback is the name: a panel that dropped its options because it could not
    // draw them would make the required slot unfillable, which is the gate of FR-005 slammed
    // shut by a missing file — the exact failure this pair of requirements forbids.
    expect(opcoesDe(mounted.tree, 'cabelo')).toHaveLength(TAMANHOS.cabelo as number)
    const escolha = controle(mounted.tree, 'data-item', 'cabelo-5')
    expect(escolha.props.children).toContain('cabelo cabelo-5')
    pressionar(escolha)
    expect(ultimoEstado(mounted).itens.cabelo).toBe('cabelo-5')
  })

  it('composes a chosen piece that has no four-direction sheet, from what it does have', () => {
    const escolhido = CONFIG_COMPLETA.itens.cabelo as string
    const { tree } = mount({
      inicial: CONFIG_COMPLETA,
      itens: catalogoSemFolhasEm(escolhido),
    })
    const camadas = preview(tree).props.camadas ?? []
    const cabelo = camadas.find((camada) => camada.slot === 'cabelo')
    // `AvatarCamada.sprite` is documented as *"drawn as the only frame when there is no sheet"*.
    // Dropping the layer instead would hide a piece the person chose and can see selected.
    expect(cabelo?.spriteFolhas).toBeUndefined()
    expect(cabelo?.sprite).toBe(spriteDe(escolhido))
    // Every other chosen piece still pulls its sheet: the degradation did not spread.
    const outros = camadas.filter((camada) => camada.slot !== 'cabelo')
    expect(outros).toHaveLength(SLOTS_OBRIGATORIOS.length - 1)
    for (const camada of outros) {
      expect(camada.spriteFolhas, `slot ${camada.slot} lost its sheet with cabelos`).toBeDefined()
    }
  })

  it('drops a layer whose row has left the catalogue, and still lets signup finish', () => {
    const config: AvatarConfig = {
      ...CONFIG_COMPLETA,
      itens: { ...CONFIG_COMPLETA.itens, sapatos: 'sapatos-que-nao-existe' },
    }
    const camadas = preview(mount({ inicial: config }).tree).props.camadas ?? []
    expect(camadas.map((camada) => camada.slot)).not.toContain('sapatos')
    // A deleted row is the same failure as a 404 sprite, one level up. The configuration still
    // names a choice for every required slot, so the gate stays open: FR-007s *"never blocking
    // account creation"* is about the gate, not about what could be drawn.
    expect(avatarCompleto(config, SLOTS)).toBe(true)
  })
})

/**
 * T035d / FR-032c, US2 — the builder operated with no pointer at all.
 *
 * The requirement is one sentence — *"reachable and fully operable by keyboard: every slot, the
 * rotation and the submit, with no control reachable only by pointer"* — and it needs executed
 * assertions rather than a review note because **every way of breaking it still looks right on
 * screen**. A `div` with an `onClick` draws the same thumbnail, takes the same press from a
 * mouse, and is simply not there for the Tab key. A `tabIndex={-1}` added to tidy a 125-stop tab
 * order removes a whole slot from the keyboard. A picker wired to `onMouseDown` answers a
 * trackpad and nothing else.
 *
 * So the audit walks the tree the component returns and holds every control that does something
 * to what a keyboard needs: it is a native `button` (the browser turns Enter and Space into a
 * click; nothing else does), it carries `type="button"` — the builder is mounted inside the
 * signup form, where a bare button is a **submit**, and the submit FR-032c names is the page's
 * `SALVAR E CONTINUAR`, never a haircut — and it is still in the tab order.
 *
 * The count is asserted first, because an audit that iterates an empty list passes. It is
 * derived from the pickers the tree itself renders, plus the rotation — the one control that
 * belongs to no panel and is therefore the one a loop over the panels silently skips.
 *
 * The focus **ring** is deliberately not re-asserted here: FR-032b owns it, and T035c's
 * `breakpoints-focus.test.ts` scores it against the painted background at the three widths,
 * which is a far stronger instrument than matching a selector in this file.
 */

/** Events a pointer fires and a keyboard never does. A control wired to one of these instead of
 *  `onClick` is precisely what FR-032c forbids: reachable by pointer alone. */
const EVENTOS_DE_PONTEIRO = ['onMouseDown', 'onMouseUp', 'onMouseEnter', 'onMouseOver',
  'onDoubleClick', 'onPointerDown', 'onPointerUp', 'onTouchStart', 'onDragStart'] as const

/** Everything in the tree that does something when it is pressed. */
const controlesDe = (tree: AnyElement): AnyElement[] =>
  elementsOf(tree).filter((element) => typeof element.props.onClick === 'function')

/** How a control names itself in a failure message, so a report points at one thumbnail. */
const identidade = (element: AnyElement): string =>
  String(element.props['data-item'] ?? element.props['data-rotacao'] ?? element.key)

/** The text a reader would announce out of a subtree. */
function textoDe(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map((child) => textoDe(child as ReactNode)).join('')
  if (!isValidElement(node)) return ''
  return textoDe((node as AnyElement).props.children)
}

/** An element's accessible name by either route, so the audit does not dictate which one the
 *  markup takes — `aria-label` and `aria-labelledby` are the same promise to a reader. */
const nomeAcessivel = (tree: AnyElement, el?: AnyElement): string =>
  typeof el?.props['aria-label'] === 'string'
    ? String(el.props['aria-label'])
    : textoDe(elementsOf(tree).find((o) => o.props.id === el?.props['aria-labelledby']))

describe('operable with no pointer at all (FR-032c)', () => {
  it('gives every control to Enter and Space, and leaves it in the tab order', () => {
    const { tree } = mount()
    const controles = controlesDe(tree)
    // Every attribute that marks a picker: their union is every control but the rotation.
    const atributos = ['data-item', 'data-base', 'data-tom-pele', 'data-tom-cabelo']
    const pickers = atributos.reduce((n, atr) => n + valoresDe(tree, atr).length, 0)
    // The rotation and every picker — the controls FR-032c enumerates, none of them skipped.
    expect(controles).toHaveLength(pickers + 1)
    for (const controle of controles) {
      expect(controle.type, `${identidade(controle)} is not a native button`).toBe('button')
      expect(controle.props.type, `${identidade(controle)} submits the form`).toBe('button')
      expect(controle.props.tabIndex ?? 0, `${identidade(controle)} left the tab order`).toBe(0)
      expect(controle.props['aria-hidden'], `${identidade(controle)} is hidden`).toBeUndefined()
    }
  })

  it('answers no event a keyboard cannot fire', () => {
    const ofensores = elementsOf(mount({ inicial: CONFIG_ESCOLHIDA }).tree).flatMap((el) =>
      EVENTOS_DE_PONTEIRO.filter((e) => el.props[e] !== undefined).map((e) => identidade(el) + e))
    expect(ofensores, 'a control answers the pointer and not the keyboard').toEqual([])
  })

  it('tells the keyboard which panel it has arrived in', () => {
    const { tree } = mount()
    const secoes = elementsOf(tree).filter((element) => element.type === 'section')
    // Nine slots, the base and the two palettes: every panel, or the loop below proves nothing
    // about the one that went missing.
    expect(secoes).toHaveLength(SLOTS_ORDEM.length + 3)
    for (const secao of secoes) {
      const [cabecalho, lista] = ['h3', 'ul'].map((t) => elementsOf(secao).find((e) => e.type === t))
      const titulo = textoDe(cabecalho)
      // Someone who can see reads the heading above the row. Someone arriving on the thirtieth
      // Tab press hears `cabelo-5, button` and nothing else — ~125 controls of identical shape,
      // with no way to tell OCULOS from CHAPEU — unless the row announces itself as that panel.
      expect(lista?.props.role, `the ${titulo} options are not a group`).toBe('group')
      expect(nomeAcessivel(tree, lista), `the ${titulo} group is unnamed`).toBe(titulo)
    }
  })
})
