'use client'
// The same seam step 1 needs, for the same reason (`criar-conta/PassoDoAvatar.tsx` records it):
// `AvatarBuilder` holds the nine choices, the two palettes and the base in `useState` and reports
// every press through `onChange`, so the configuration a save must carry exists only after a
// press — and the page that mounts this is a server component which read the catalogue before a
// single choice was made. What is different here is the destination: step 1 hands the draft
// forward in a query, and this screen POSTs it to a server action that writes the profile.

import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'

import {
  AvatarBuilder,
  Button,
  avatarCompleto,
  escolhasFaltando,
  type AvatarConfig,
  type ItemAvatar,
  type SlotAvatar,
  type TomAvatar,
} from '@fablab/ui'

// **Imported, not re-implemented.** The stored configuration reaches this island as the same
// bounded, opaque string step 1's draft travels as, and `configDoRascunho` is the one reading of
// it: base, the two palettes, the chosen items and the direction, each defaulted rather than
// thrown on. A second parser here would be a second idea of what an avatar is, and the half that
// drifts is always the one with no test looking at it.
import { configDoRascunho } from '../../criar-conta/PassoDoAvatar'

/**
 * T035 / FR-023, US6 — the builder as an **editor**: opened on the avatar the person already
 * has, and submitted to the action that writes it.
 *
 * ── Why the action arrives as a prop ────────────────────────────────────────────────────────
 *
 * A server component may hand a client one data, never a function — except a server action,
 * which is exactly what `salvarAvatar` is. So the route keeps the write (it owns the session
 * lookup and the FR-024 gate) and this island keeps the state, which is the only split that
 * lets the configuration be both live and server-written.
 *
 * ── Why the configuration travels in a hidden field ─────────────────────────────────────────
 *
 * It is the whole mechanism: the field is re-serialised on every press, so whatever is on screen
 * when SALVAR is pressed is what the action receives. The name is the page's
 * ({@link EditorDoAvatarProps.campo}), because the field that is written and the field that is
 * read are one decision and two spellings of it is a save that silently posts nothing.
 *
 * @example
 *   <EditorDoAvatar slots={SLOTS} itens={itens} peles={peles} cabelos={cabelos}
 *                   larguraBase={32} alturaBase={48} alt="Seu avatar"
 *                   rascunho={JSON.stringify(perfil.avatarConfig)}
 *                   campo="avatar" acao={salvarAvatar} cancelar={<a href="/minha-conta" />} />
 */
export interface EditorDoAvatarProps {
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
  /** The stored configuration, serialised by the page (FR-023). `null` opens the defaults —
   *  a profile seeded by a fixture has never been through the builder. */
  readonly rascunho: string | null
  /** The hidden field the configuration is posted in — the action reads this same name. */
  readonly campo: string
  /** The server action that writes the profile. */
  readonly acao: (dados: FormData) => Promise<void>
  /**
   * The way out without saving, rendered by the page and placed here.
   *
   * The element rather than its href, for the reason step 1 hands `VOLTAR` down: the page also
   * renders it on the path where the catalogue read failed and this island never mounts, and one
   * definition of the copy and the destination is what keeps the two from drifting.
   */
  readonly cancelar: ReactNode
}

/** The class the page's media query targets. Declared here because the element wearing it is
 *  rendered here, and exported so the stylesheet and the markup cannot drift apart. */
export const CLASSE_DO_EDITOR = 'fl-editar-avatar'

/** The headings of the two panels that are not item slots — `escolhasFaltando` reports these two
 *  keys beside the slot names, and a person reading *"falta escolher: cabeloTom"* would be
 *  reading a column name off a database. */
const TITULO_DA_PALETA: Readonly<Record<string, string>> = Object.freeze({
  cabeloTom: 'TONS DE CABELO',
  pele: 'TONS DE PELE',
})

/**
 * The editor: the builder, the field that carries its answer, and the submit over both.
 *
 * The submit is gated by the same rule step 1 is gated by (`avatarCompleto`), and for a reason
 * this screen makes sharper than signup does: the person arrives with a **complete** avatar, so
 * an incomplete configuration here can only be one they took apart — and saving it would replace
 * a finished avatar with a half-built one.
 */
export function EditorDoAvatar({
  slots,
  itens,
  peles,
  cabelos,
  larguraBase,
  alturaBase,
  larguraAlvo,
  alt,
  rascunho,
  campo,
  acao,
  cancelar,
}: EditorDoAvatarProps): ReactElement {
  const [inicial] = useState<AvatarConfig>(() => configDoRascunho(rascunho))
  const [config, setConfig] = useState<AvatarConfig>(inicial)

  // The boolean is the gate and the list is the explanation, read from the same rule on purpose:
  // a disabled button whose message disagrees with it is worse than either.
  const completo = avatarCompleto(config, slots)
  const faltando = escolhasFaltando(config, slots)

  return (
    <form action={acao} className={CLASSE_DO_EDITOR} style={ESTILO.editor}>
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
        onChange={setConfig}
      />
      {/* Re-serialised on every press, so what is on screen is what the action receives. */}
      <input type="hidden" name={campo} value={JSON.stringify(config)} readOnly />
      <div style={ESTILO.acoes}>
        {cancelar}
        <Button type="submit" disabled={!completo}>
          SALVAR ALTERAÇÕES
        </Button>
        {completo ? null : aindaFalta(faltando, slots)}
      </div>
    </form>
  )
}

/**
 * Which panels are unanswered, named as the person sees them.
 *
 * `role="status"`: the list changes under a press elsewhere on the screen, and someone using a
 * screen reader has no way to discover that the button they cannot reach has one fewer reason.
 * `data-faltando` carries the raw keys beside the sentence so the rule can be asserted without a
 * test having to parse Portuguese prose.
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
 *  around it write them; every colour is a token (FR-034). */
const ESTILO: Record<string, CSSProperties> = {
  editor: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  acoes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)' },
  faltando: {
    margin: 0,
    flexBasis: '100%',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
}
