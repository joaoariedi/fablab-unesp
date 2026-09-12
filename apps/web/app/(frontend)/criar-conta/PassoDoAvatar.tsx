'use client'
// The gate FR-005 asks for has to live where the avatar does. `AvatarBuilder` holds the nine
// choices, the two palettes and the base in `useState` and reports every press through
// `onChange`; whether `SALVAR E CONTINUAR` may be pressed is therefore a question the server
// cannot answer — it rendered this page before a single choice existed. This component is the
// seam: it holds the configuration the builder emits and turns it into the one decision the
// page shell owns, which is whether step 1 is finished.

import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'

import {
  AvatarBuilder,
  avatarCompleto,
  DIRECOES_AVATAR,
  escolhasFaltando,
  PRIMARY_BUTTON_STYLE,
  type AvatarConfig,
  type BaseAvatar,
  type DirecaoAvatar,
  type ItemAvatar,
  type SlotAvatar,
  type TomAvatar,
} from '@fablab/ui'

/**
 * T024c / FR-005, FR-002, US2 — the builder mounted on step 1, with the way forward gated.
 *
 * ── Why this file exists at all ─────────────────────────────────────────────────────────────
 *
 * `AvatarBuilder` deliberately owns no submit: its docblock records the reason — *"a builder
 * that owned the submit would be one that also had to know about step 2"*, which is why T024b
 * put `avatarCompleto`/`escolhasFaltando` in that module as **pure functions** and left the gate
 * to the page. But the page is a server component that reads the catalogue (FR-024, and its own
 * §7 test), so it cannot see a configuration that only exists after a press. Something has to
 * hold both: the live config on one side, and step 2's destination on the other. That is this.
 *
 * ── What it refuses to do ───────────────────────────────────────────────────────────────────
 *
 * It knows step 2 only as **two strings** ({@link PassoDoAvatarProps.passo2Path} and
 * {@link PassoDoAvatarProps.paramAvatar}), because a server component may hand a client one data
 * and never a function — `hrefDoPasso2` cannot cross the boundary, so the destination does, and
 * the route stays the page's to decide.
 *
 * @example
 *   <PassoDoAvatar slots={SLOTS_DO_BUILDER} itens={itens} peles={peles} cabelos={cabelos}
 *                  larguraBase={32} alturaBase={48} alt="Seu avatar" rascunho={rascunho}
 *                  passo2Path="/criar-conta/dados" paramAvatar="avatar" voltar={voltar()} />
 */
export interface PassoDoAvatarProps {
  /** The nine pickers with their headings — the page's vocabulary, never this file's. */
  readonly slots: readonly SlotAvatar[]
  readonly itens: readonly ItemAvatar[]
  readonly peles: readonly TomAvatar[]
  readonly cabelos: readonly TomAvatar[]
  /** One frame in source pixels. Passed through to the builder, which has no default. */
  readonly larguraBase: number
  readonly alturaBase: number
  readonly larguraAlvo?: number
  /** The composed avatar is a person's depiction of themselves, so it is labelled. */
  readonly alt: string
  /** The draft step 2's `VOLTAR` carried back — still the string the page was handed. */
  readonly rascunho: string | null
  /** Step 2's path and the parameter the draft travels in (FR-002). */
  readonly passo2Path: string
  readonly paramAvatar: string
  /**
   * Step 1's `VOLTAR`, rendered by the page and placed here.
   *
   * The element rather than its href, because this island is not the only place it appears: the
   * page renders the same button on its own when the catalogue read fails and nothing here
   * mounts. One definition of the copy, the destination and the secondary treatment — and the
   * shell keeps the route it owns (FR-002 gives the two steps' `VOLTAR`s different ones).
   */
  readonly voltar: ReactNode
}

/** Nothing chosen, base `F`, facing front: the mockup's opening state, and the state FR-005
 *  says step 1 may not be finished from. */
const CONFIG_PADRAO: AvatarConfig = { base: 'f', itens: {}, direcao: 'frente' }

/**
 * The headings of the two panels that are not item slots.
 *
 * `escolhasFaltando` reports `cabeloTom` and `pele` beside the slot names, and those two are the
 * only keys {@link PassoDoAvatarProps.slots} cannot translate — the palettes are panels the
 * builder draws itself. The strings mirror the ones it renders; a person reading *"falta
 * escolher: cabeloTom"* would be reading a column name off a database.
 */
const TITULO_DA_PALETA: Readonly<Record<string, string>> = Object.freeze({
  cabeloTom: 'TONS DE CABELO',
  pele: 'TONS DE PELE',
})

/** The class the page's media query targets. Declared here because the element wearing it is
 *  rendered here, and exported so the stylesheet and the markup cannot drift apart. */
export const CLASSE_DO_PASSO = 'fl-criar-conta__passo'

const ehDirecao = (valor: unknown): valor is DirecaoAvatar =>
  typeof valor === 'string' && (DIRECOES_AVATAR as readonly string[]).includes(valor)

/** Slot → chosen id, keeping only the pairs that are two strings. A draft is somebody's query
 *  string: anyone can link to step 1, so every field is read defensively rather than trusted. */
function itensDoRascunho(cru: unknown): Record<string, string> {
  if (cru === null || typeof cru !== 'object') return {}
  const pares = Object.entries(cru as Record<string, unknown>).filter(
    ([, id]) => typeof id === 'string',
  )
  return Object.fromEntries(pares) as Record<string, string>
}

/**
 * The carried draft as a configuration — the returning visitor's avatar, back in the builder.
 *
 * Parsed **here** and not on the page, which carries the string and never reads it (FR-002: the
 * value must survive the round trip byte for byte, and a page that parsed it would re-encode it).
 * A draft that is not JSON, or is JSON of the wrong shape, opens an empty builder rather than
 * throwing: the person is one bad link away from the flow, and an exception would take the whole
 * step down instead of one slot (FR-007's rule, at the scale of the whole configuration).
 *
 * @example configDoRascunho('{"base":"m","itens":{}}') // base `m`, nothing chosen
 * @example configDoRascunho('não é json') // the opening state
 */
export function configDoRascunho(rascunho: string | null): AvatarConfig {
  if (rascunho === null) return CONFIG_PADRAO
  let cru: unknown
  try {
    cru = JSON.parse(rascunho)
  } catch {
    return CONFIG_PADRAO
  }
  if (cru === null || typeof cru !== 'object') return CONFIG_PADRAO
  const draft = cru as Record<string, unknown>
  return {
    base: (draft.base === 'm' ? 'm' : 'f') as BaseAvatar,
    pele: typeof draft.pele === 'string' ? draft.pele : undefined,
    cabeloTom: typeof draft.cabeloTom === 'string' ? draft.cabeloTom : undefined,
    itens: itensDoRascunho(draft.itens),
    direcao: ehDirecao(draft.direcao) ? draft.direcao : CONFIG_PADRAO.direcao,
  }
}

/** Step 2, carrying the draft. `encodeURIComponent`, never concatenation: a configuration
 *  contains `&`, `#` and `=`, and a hand-built query truncates at the first of them. */
function hrefDoPasso2(rascunho: string | null, passo2Path: string, paramAvatar: string): string {
  if (rascunho === null || rascunho.length === 0) return passo2Path
  return `${passo2Path}?${paramAvatar}=${encodeURIComponent(rascunho)}`
}

/**
 * `/criar-conta` step 1: the builder, and the gate over `SALVAR E CONTINUAR` (FR-005).
 *
 * Two pieces of state, and the second one is not redundant. `config` is what the person built.
 * `tocado` is whether they built it *here*: until the first press, the draft carried on to step 2
 * is the **exact string** this step was handed, because re-serialising an untouched avatar would
 * quietly drop every field this step does not model and make FR-002's round trip lossy for no
 * gain at all.
 */
export function PassoDoAvatar({
  slots,
  itens,
  peles,
  cabelos,
  larguraBase,
  alturaBase,
  larguraAlvo,
  alt,
  rascunho,
  passo2Path,
  paramAvatar,
  voltar,
}: PassoDoAvatarProps): ReactElement {
  const [inicial] = useState<AvatarConfig>(() => configDoRascunho(rascunho))
  const [config, setConfig] = useState<AvatarConfig>(inicial)
  const [tocado, setTocado] = useState(false)

  // The boolean is the gate and the list is the explanation, and they are read from the same
  // rule on purpose: a disabled button whose message disagrees with it is worse than either.
  const podeContinuar = avatarCompleto(config, slots)
  const faltando = escolhasFaltando(config, slots)

  const href = hrefDoPasso2(tocado ? JSON.stringify(config) : rascunho, passo2Path, paramAvatar)

  return (
    <div className={CLASSE_DO_PASSO} style={ESTILO.passo}>
      <AvatarBuilder
        slots={slots}
        itens={itens}
        peles={peles}
        cabelos={cabelos}
        larguraBase={larguraBase}
        alturaBase={alturaBase}
        larguraAlvo={larguraAlvo}
        alt={alt}
        inicial={inicial}
        onChange={(proximo) => {
          setConfig(proximo)
          setTocado(true)
        }}
      />
      {acoes({ href, podeContinuar, faltando, slots, voltar })}
    </div>
  )
}

interface AcoesProps {
  readonly href: string
  readonly podeContinuar: boolean
  readonly faltando: readonly string[]
  readonly slots: readonly SlotAvatar[]
  readonly voltar: ReactNode
}

/**
 * The rail's two buttons, and the reason the second one may be shut.
 *
 * `inert` rather than a class that only *looks* disabled: a styled anchor still navigates — by
 * click, by Enter, and by the middle button that opens it in a tab nobody styled — so the
 * visitor who opens step 1 and presses the one filled button on the screen would land in step 2
 * with an empty avatar, which is the whole of what FR-005 forbids. The attribute is also the
 * no-JavaScript answer: it is in the server-rendered HTML, so the gate holds before hydration.
 *
 * The continue is an anchor wearing a button's identity, as the rest of the flow writes them: a
 * `<button>` navigates nowhere without a handler. `VOLTAR` arrives already rendered from the page
 * — see {@link PassoDoAvatarProps.voltar}.
 */
function acoes({ href, podeContinuar, faltando, slots, voltar }: AcoesProps): ReactElement {
  return (
    <div style={ESTILO.acoes}>
      {voltar}
      {/* The wrapper carries `inert`, not the anchor: an inert anchor is still in the tab order
          in browsers that ignore the attribute, and the wrapper is what a future spinner state
          would need anyway. `aria-disabled` stays on the control itself, where a screen reader
          looks for it. */}
      <span data-continuar="" inert={!podeContinuar} style={ESTILO.envoltorio}>
        <a
          href={href}
          aria-disabled={podeContinuar ? undefined : true}
          tabIndex={podeContinuar ? undefined : -1}
          style={podeContinuar ? ESTILO.continuar : ESTILO.continuarBloqueado}
        >
          SALVAR E CONTINUAR →
        </a>
      </span>
      {podeContinuar ? null : aindaFalta(faltando, slots)}
    </div>
  )
}

/**
 * Which panels are still unanswered, named as the person sees them.
 *
 * `role="status"`: the list changes under a press elsewhere on the screen, and a person using a
 * screen reader has no way to discover that the button they cannot reach has one fewer reason.
 * `data-faltando` carries the raw keys beside the sentence so the rule can be asserted without
 * a test having to parse Portuguese prose.
 */
function aindaFalta(faltando: readonly string[], slots: readonly SlotAvatar[]): ReactElement {
  const titulos = new Map(slots.map(({ slot, titulo }) => [slot, titulo]))
  const nomes = faltando.map((chave) => titulos.get(chave) ?? TITULO_DA_PALETA[chave] ?? chave)
  return (
    <p role="status" data-faltando={faltando.join(' ')} style={ESTILO.faltando}>
      {`Ainda falta escolher: ${nomes.join(', ')}.`}
    </p>
  )
}

/** Every style this component declares. Style objects rather than a stylesheet, as the pages
 *  around it write them; every colour is a token (FR-027). */
const ESTILO: Record<string, CSSProperties> = {
  passo: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  acoes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' },
  envoltorio: { display: 'inline-block' },
  continuar: {
    // The canonical primary, spread rather than restated: the CTA follows a change to the
    // button and no colour can be typed into this file (FR-027).
    ...PRIMARY_BUTTON_STYLE,
    display: 'inline-block',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
  },
  continuarBloqueado: {
    ...PRIMARY_BUTTON_STYLE,
    display: 'inline-block',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
    // Dimmed rather than recoloured: the button must still read as the thing the person is
    // working towards. `opacity` keeps the token palette intact, so the colour fence is
    // untouched and the disabled state cannot drift away from the enabled one.
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  faltando: {
    margin: 0,
    flexBasis: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
}
