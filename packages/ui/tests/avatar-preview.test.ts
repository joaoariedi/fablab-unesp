import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  AvatarPreview,
  DIRECOES_AVATAR,
  proximaDirecao,
  type AvatarCamada,
  type DirecaoAvatar,
} from '../src/components/AvatarPreview'

/**
 * T023 / FR-006, US2 — the composed avatar: `camadaZ` order, and the four directions.
 *
 * FR-006 is two promises in one sentence — *"the preview composes sprites in the declared
 * `camada_z` order and rotates through four directions"* — and they fail in different ways.
 * Composition fails **silently**: a preview that stacks the layers in whatever order the
 * catalogue read returned them draws a face under the hair for the 30 cabelo rows whose id
 * happens to sort first, and every assertion about "the sprites are on screen" still passes.
 * Rotation fails **loudly**, but only for the three directions nobody looks at while building
 * the happy path.
 *
 * So the order is asserted against a deliberately **shuffled** input rather than an already
 * sorted one — an implementation that just maps over its prop satisfies a sorted fixture and
 * nothing else — and each of the four directions is asserted to select a different frame of
 * the same sheet.
 *
 * ── Why this test calls the component instead of rendering it ───────────────────────────────
 *
 * CLR-003 (feature 001) keeps this package's stack at `node` with no `jsdom`/`happy-dom`, and
 * `vitest.config.ts` states it, so nothing here renders. A React function component is a plain
 * function returning a plain object, so calling it and reading the children's props asserts the
 * tree the component actually builds — the same move `pixel-image.test.ts`, `skill-pips.test.ts`
 * and `button.test.ts` make.
 *
 * What it cannot prove: that the browser paints the stack crisply and in that order. That is the
 * workbench (FR-016) and feature 003's Playwright.
 */

const SOURCE_PATH = fileURLToPath(new URL('../src/components/AvatarPreview.tsx', import.meta.url))

/** The authored sprite frame. Both are props with no default, for `PixelImage`'s reason: a
 *  hard-coded size passes every avatar and quietly halves anything drawn at another size. */
const LARGURA = 32
const ALTURA = 48

/** One layer, typed enough to read what the component put on it without `any`. */
type Camada = ReactElement<{ readonly style?: Record<string, unknown> }>

/** The root, whose children are the layers in the order the component chose to emit them. */
type Raiz = ReactElement<{
  readonly role?: string
  readonly 'aria-label'?: string
  readonly style?: Record<string, unknown>
  readonly children?: readonly Camada[]
}>

/**
 * The nine slots as a catalogue read might hand them over: **out of `camadaZ` order**, with the
 * accessory that draws last sitting first in the array. `chapeu` over `cabelo` is the pairing
 * the wrong implementation gets visibly wrong.
 */
const CAMADAS_EMBARALHADAS: readonly AvatarCamada[] = [
  { slot: 'chapeu', camadaZ: 90, sprite: '/av/chapeu.png', spriteFolhas: '/av/chapeu-4.png' },
  { slot: 'olhos', camadaZ: 40, sprite: '/av/olhos.png', spriteFolhas: '/av/olhos-4.png' },
  { slot: 'corpo', camadaZ: 10, sprite: '/av/corpo.png', spriteFolhas: '/av/corpo-4.png' },
  { slot: 'cabelo', camadaZ: 80, sprite: '/av/cabelo.png', spriteFolhas: '/av/cabelo-4.png' },
  { slot: 'roupaCima', camadaZ: 60, sprite: '/av/roupa.png', spriteFolhas: '/av/roupa-4.png' },
]

/** `camadaZ` ascending — what the component must emit whatever order it was handed. */
const ORDEM_ESPERADA = ['corpo', 'olhos', 'roupaCima', 'cabelo', 'chapeu']

function preview(props: Partial<Parameters<typeof AvatarPreview>[0]> = {}): Raiz {
  return AvatarPreview({
    camadas: CAMADAS_EMBARALHADAS,
    larguraBase: LARGURA,
    alturaBase: ALTURA,
    alt: 'Avatar de Maria Silva',
    ...props,
  }) as Raiz
}

function camadas(raiz: Raiz): readonly Camada[] {
  // Always an array: the component builds its children with `.map()`. A component that emitted
  // a single child would fail `toEqual` on the order assertions rather than silently pass here.
  return raiz.props.children ?? []
}

/** The `zIndex` each emitted layer carries, in emission order. */
function zIndices(raiz: Raiz): number[] {
  return camadas(raiz).map((camada) => Number(camada.props.style?.zIndex))
}

/** The layer belonging to one slot, found by the key the component gave it. */
function camadaDoSlot(raiz: Raiz, slot: string): Camada {
  const encontrada = camadas(raiz).find((camada) => camada.key === slot)
  if (!encontrada) throw new Error(`no layer was emitted for slot "${slot}"`)
  return encontrada
}

describe('AvatarPreview — composition in camadaZ order (FR-006)', () => {
  it('emits every layer it was handed', () => {
    // The guard the two assertions below share: over an empty children array, "sorted" and
    // "z-indexed" are both vacuously true.
    expect(camadas(preview()).length).toBe(CAMADAS_EMBARALHADAS.length)
  })

  it('stacks by camadaZ ascending, not in the order the catalogue returned them', () => {
    // The fixture arrives with `chapeu` (90) first and `corpo` (10) third. An implementation
    // that maps over its prop emits the hat under the body and passes every other assertion.
    expect(camadas(preview()).map((camada) => camada.key)).toEqual(ORDEM_ESPERADA)
  })

  it('carries camadaZ onto the element, so the cascade cannot re-order the stack', () => {
    // Document order alone settles the paint order only while nothing else creates a stacking
    // context around it. The declared number is the promise FR-006 makes; emitting it is what
    // makes the promise survive a positioned ancestor.
    expect(zIndices(preview())).toEqual([10, 40, 60, 80, 90])
  })

  it('drops a layer with no sprite at all instead of emitting url()', () => {
    // FR-007's floor: a slot with nothing to draw degrades THAT slot. `url()` with an empty
    // path is a request for the current document — a broken image, and on some servers a
    // second full page load behind every avatar.
    const semSprite: readonly AvatarCamada[] = [
      { slot: 'oculos', camadaZ: 85 },
      ...CAMADAS_EMBARALHADAS,
    ]
    const emitidas = camadas(preview({ camadas: semSprite })).map((camada) => camada.key)
    expect(emitidas).toEqual(ORDEM_ESPERADA)
  })
})

describe('AvatarPreview — the four directions (FR-006)', () => {
  it('offers exactly four directions, and they are distinct', () => {
    expect(DIRECOES_AVATAR.length).toBe(4)
    expect(new Set(DIRECOES_AVATAR).size).toBe(4)
  })

  it('reads the direction out of the four-direction sheet, one frame per direction', () => {
    // The sheet is one image of four frames, selected by background-position (plan § "The
    // preview composes by background-position"). Each direction must land on its own frame:
    // an implementation that ignores `direcao` draws the front view in all four.
    const posicoes = DIRECOES_AVATAR.map(
      (direcao) => camadaDoSlot(preview({ direcao }), 'cabelo').props.style?.backgroundPosition,
    )
    expect(new Set(posicoes).size).toBe(4)
    expect(posicoes[0]).toBe('0px 0px')
    expect(posicoes[1]).toBe(`-${LARGURA}px 0px`)
    expect(posicoes[3]).toBe(`-${LARGURA * 3}px 0px`)
  })

  it('sizes the sheet as four frames wide, so a frame is a frame and not a squeeze', () => {
    const estilo = camadaDoSlot(preview({ direcao: 'costas' }), 'cabelo').props.style
    expect(estilo?.backgroundImage).toBe('url(/av/cabelo-4.png)')
    expect(estilo?.backgroundSize).toBe(`${LARGURA * 4}px ${ALTURA}px`)
  })

  it('falls back to the single-direction sprite for a slot with no sheet — that slot only', () => {
    // FR-007 again, in the form the catalogue actually produces: `spriteFolhas` is optional on
    // `avatarItem`, so an item can have a picker sprite and no rotation sheet. It must draw its
    // one frame rather than a slice of a sheet that is not there, while its neighbours rotate.
    const semFolhas = CAMADAS_EMBARALHADAS.map((camada) =>
      camada.slot === 'cabelo' ? { ...camada, spriteFolhas: undefined } : camada,
    )
    const raiz = preview({ camadas: semFolhas, direcao: 'esquerda' })
    const cabelo = camadaDoSlot(raiz, 'cabelo').props.style
    expect(cabelo?.backgroundImage).toBe('url(/av/cabelo.png)')
    expect(cabelo?.backgroundPosition).toBe('0px 0px')
    expect(cabelo?.backgroundSize).toBe(`${LARGURA}px ${ALTURA}px`)
    // The neighbour still rotates: the degradation is per slot, never per preview.
    expect(camadaDoSlot(raiz, 'corpo').props.style?.backgroundPosition).toBe(
      `-${LARGURA * 3}px 0px`,
    )
  })

  it('rotates through all four and returns to where it started', () => {
    // The rotation button's rule, kept beside the composition it rotates. A cycle that skips
    // one direction, or that reverses at the end, satisfies "four directions" in wording only.
    const inicio: DirecaoAvatar = 'frente'
    const visitadas: DirecaoAvatar[] = [inicio]
    let atual: DirecaoAvatar = inicio
    for (let passo = 0; passo < 3; passo += 1) {
      atual = proximaDirecao(atual)
      visitadas.push(atual)
    }
    expect(visitadas).toEqual([...DIRECOES_AVATAR])
    expect(proximaDirecao(atual)).toBe(inicio)
  })
})

describe('AvatarPreview — drawn at a whole multiple, and server-renderable (FR-006, FR-018)', () => {
  it('scales every layer by the same whole multiple the pixel clamp allows', () => {
    // 100/32 = 3.125. Rounding up re-samples the sprite back down and the pixel art goes muddy
    // — `clampScale` is the one place that decision is made, and the preview must share it
    // rather than multiply the width it was asked for.
    const raiz = preview({ larguraAlvo: 100, direcao: 'direita' })
    const estilo = camadaDoSlot(raiz, 'cabelo').props.style
    expect(estilo?.width).toBe(LARGURA * 3)
    expect(estilo?.height).toBe(ALTURA * 3)
    expect(estilo?.backgroundSize).toBe(`${LARGURA * 3 * 4}px ${ALTURA * 3}px`)
    expect(estilo?.backgroundPosition).toBe(`-${LARGURA * 3}px 0px`)
    expect(raiz.props.style?.width).toBe(LARGURA * 3)
  })

  it('keeps the sprites unsmoothed, the whole reason the scale is a whole number', () => {
    expect(camadaDoSlot(preview(), 'corpo').props.style?.imageRendering).toBe('pixelated')
  })

  it('is one image to a screen reader, not five decorative boxes', () => {
    const raiz = preview()
    expect(raiz.props.role).toBe('img')
    expect(raiz.props['aria-label']).toBe('Avatar de Maria Silva')
  })

  it('is server-renderable: no client directive, no state, no handler', () => {
    // The task's word is "server-renderable", and it is what lets a card reuse the composition
    // without the builder island. A `'use client'` here would pull every listing that draws an
    // avatar into the bundle, and `islands.test.ts` would then demand an entry for a component
    // that needs none.
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toMatch(/^\s*['"]use client['"]/m)
    expect(source).not.toMatch(/\buse(State|Effect|Ref|Reducer)\s*\(/)
    expect(source).not.toMatch(/\bon[A-Z][A-Za-z]*=\{/)
  })
})
