import type { CSSProperties, ReactElement } from 'react'

import { clampScale } from './PixelImage'

/**
 * T023 / FR-006, US2 — the composed avatar: `camadaZ` order, and the four directions.
 *
 * `onboarding.md` § *Preview do avatar*: pixel art of the whole body over the isometric teal
 * platform, with the ⟳ button cycling **4 directions** (decided 2026-08-23). FR-006 is the two
 * halves of that in one sentence — the stack is composed *in the declared order*, and the
 * rotation reaches *all four* frames.
 *
 * ── Server-renderable, which is the word the task chose and the reason this file exists ─────
 *
 * No `'use client'`, no state, no handler. The **island** (`AvatarBuilder`, T024) owns the
 * selection and which direction is showing; this component is handed a direction and draws it.
 * That is what lets a **card** reuse the composition — a listing that draws twelve avatars must
 * not pull the builder's bundle in behind them — and it is why `proximaDirecao` is exported as a
 * function rather than kept as state here: the rotation *rule* lives beside the composition it
 * rotates, and the island only holds which step it is on.
 *
 * ── Why the props are resolved layers, and not `config` + `catalogo` ────────────────────────
 *
 * The plan's sketch drew `<AvatarPreview config={config} catalogo={catalogo} …/>`. Resolving a
 * config against a catalogue means knowing the nine slots and the shape of an `avatarItem` row,
 * and both live in `apps/web/collections/avatar` — which FR-018's purity boundary forbids this
 * package from importing, and which `purity-boundary.test.ts` enforces by running the real
 * ESLint over probe files. The signature would therefore have cost a **second copy** of
 * `CATEGORIAS_AVATAR` here, held to the first by nothing. Selection is the island's job
 * already (plan § *the island owns selection only*), so the resolved list is the prop and the
 * slot vocabulary stays in one place.
 *
 * ── Why background-position and not nine stacked `<img>`s ───────────────────────────────────
 *
 * The plan's delivery decision: one **preview sheet** per chosen item carrying all four
 * directions, so rotating is a repaint rather than nine more requests, and `sprite` stays the
 * single-direction picker art. `PixelImage` cannot express that — it is an `<img>`, and an
 * `<img>` draws the whole file — so the layers are backgrounds, and the scale is shared with it
 * through {@link clampScale} rather than recomputed.
 *
 * @example
 *   <AvatarPreview
 *     camadas={camadasEscolhidas}
 *     larguraBase={32} alturaBase={48} larguraAlvo={192}
 *     direcao="frente" alt="Avatar de Maria Silva"
 *   />
 */

/**
 * The four directions, **in the order the rotation visits them** — clockwise from the front.
 *
 * The order is load-bearing twice over: it is the cycle the ⟳ button walks, and the index is
 * the frame's position in the four-direction sheet. Two orders would mean the button turning
 * the avatar one way and the sheet answering with another.
 */
export type DirecaoAvatar = 'frente' | 'direita' | 'costas' | 'esquerda'

/** {@link DirecaoAvatar} as data, frozen — the frame index of a direction is its index here. */
export const DIRECOES_AVATAR: readonly DirecaoAvatar[] = Object.freeze([
  'frente',
  'direita',
  'costas',
  'esquerda',
])

/** The first direction, and what a preview shows when nobody has rotated it yet. */
const DIRECAO_PADRAO: DirecaoAvatar = 'frente'

/**
 * The next direction in the cycle, wrapping at the end.
 *
 * Exported because the island presses the button and this decides what the press means. Wrapping
 * with `%` rather than clamping: a rotation that stops at `esquerda` leaves the person unable to
 * get back to the front without three presses in the other direction they do not have.
 *
 * @example proximaDirecao('esquerda') // 'frente'
 */
export function proximaDirecao(atual: DirecaoAvatar): DirecaoAvatar {
  const indice = DIRECOES_AVATAR.indexOf(atual)
  // An unknown value restarts the cycle rather than throwing: -1 + 1 === 0 is `frente`, and a
  // preview that renders the front is a better answer to bad data than one that renders nothing.
  return DIRECOES_AVATAR[(indice + 1) % DIRECOES_AVATAR.length] ?? DIRECAO_PADRAO
}

/**
 * One sprite in the stack, already chosen — a row of `avatarItem` reduced to what drawing needs.
 *
 * `sprite` and `spriteFolhas` are both optional for the reason `AvatarItem.ts` declares only the
 * first `required`: a piece can exist with its picker art and no rotation sheet, and FR-007 says
 * that degrades **that slot** and never the account being created.
 */
export interface AvatarCamada {
  /** The slot it was chosen for (`cabelo`, `roupaCima`, …) — the React key, and unique by construction. */
  readonly slot: string
  /** `avatarItem.camadaZ`: smaller draws first, larger draws over it. */
  readonly camadaZ: number
  /** The single-direction sprite. Drawn as the only frame when there is no sheet. */
  readonly sprite?: string
  /** The four-direction sheet, frames laid out left to right in {@link DIRECOES_AVATAR} order. */
  readonly spriteFolhas?: string
}

export interface AvatarPreviewProps {
  /** The chosen pieces, in any order — this component sorts them (FR-006). */
  readonly camadas: readonly AvatarCamada[]
  /** One frame's width in source pixels. No default, for `PixelImage`'s reason: a hard-coded
   *  size passes every avatar authored at it and quietly halves anything else. */
  readonly larguraBase: number
  /** One frame's height in source pixels. A body sprite is taller than it is wide, so the two
   *  dimensions cannot be one number. */
  readonly alturaBase: number
  /** The width the layout would like. Honoured only at whole multiples; defaults to 1x. */
  readonly larguraAlvo?: number
  /** Which frame to draw. The island passes the one it is holding; a card passes none. */
  readonly direcao?: DirecaoAvatar
  /** The composed avatar is content — a person's depiction of themselves — so it is labelled. */
  readonly alt: string
}

/** Frames per sheet: four, because {@link DIRECOES_AVATAR} has four. */
const FRAMES = DIRECOES_AVATAR.length

/** `0px 0px` rather than `-0px 0px`: a negative zero in a CSS value reads as a bug in review. */
const posicaoDoFrame = (deslocamento: number): string =>
  deslocamento === 0 ? '0px 0px' : `-${deslocamento}px 0px`

/**
 * The style for one layer: which file, which frame of it, and at what size.
 *
 * The fallback is the whole of FR-007 at this level — with no sheet, the single sprite is drawn
 * as a one-frame image at frame 0 whatever direction is showing. A layer that kept the offset
 * would slide a sprite that has no second frame out of its own box, and the slot would go blank
 * for three of the four directions instead of simply not turning.
 */
function estiloDaCamada(
  camada: AvatarCamada,
  direcao: DirecaoAvatar,
  largura: number,
  altura: number,
): CSSProperties {
  const folha = camada.spriteFolhas
  const frames = folha ? FRAMES : 1
  const indice = folha ? Math.max(0, DIRECOES_AVATAR.indexOf(direcao)) : 0
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: largura,
    height: altura,
    zIndex: camada.camadaZ,
    backgroundImage: `url(${folha ?? camada.sprite})`,
    backgroundPosition: posicaoDoFrame(indice * largura),
    backgroundSize: `${largura * frames}px ${altura}px`,
    backgroundRepeat: 'no-repeat',
    // The same nearest-neighbour promise `PIXEL_IMAGE_STYLE` makes for an `<img>`. Without it
    // the whole-multiple scale is still smoothed by the default filter — the blur the clamp
    // exists to prevent, arriving by the other route.
    imageRendering: 'pixelated',
  }
}

/** Ascending `camadaZ`, from a copy — sorting the prop in place would mutate the caller's
 *  array, and the caller here is a `useState` value the island renders from. */
const emOrdemDeCamada = (camadas: readonly AvatarCamada[]): AvatarCamada[] =>
  [...camadas].sort((a, b) => a.camadaZ - b.camadaZ)

/** A layer with neither sprite has nothing to draw. Emitting it would produce `url()`, which is
 *  a request for the current document — a broken image, and a second page load behind it. */
const temArte = (camada: AvatarCamada): boolean =>
  Boolean(camada.spriteFolhas ?? camada.sprite)

export function AvatarPreview({
  camadas,
  larguraBase,
  alturaBase,
  larguraAlvo,
  direcao = DIRECAO_PADRAO,
  alt,
}: AvatarPreviewProps): ReactElement {
  const escala = clampScale(larguraAlvo ?? larguraBase, larguraBase)
  const largura = larguraBase * escala
  const altura = alturaBase * escala
  const raiz: CSSProperties = { position: 'relative', display: 'block', width: largura, height: altura }

  return (
    // One `role="img"` with one label, rather than five boxes a screen reader reads as nothing:
    // the stack is a single picture of one person, and its parts are not separately meaningful.
    <div role="img" aria-label={alt} style={raiz}>
      {emOrdemDeCamada(camadas)
        .filter(temArte)
        .map((camada) => (
          <span key={camada.slot} style={estiloDaCamada(camada, direcao, largura, altura)} />
        ))}
    </div>
  )
}
