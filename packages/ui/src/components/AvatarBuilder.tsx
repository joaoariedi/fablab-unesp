'use client'
// A press has to change what is on screen: which piece is in each of the nine slots, which
// skin and hair colour, which base, and which of the four directions the preview is turned to.
// That is selection state and nothing but a client bundle can hold it (FR-003, FR-032, and the
// seat this island holds in `islands.test.ts` § ALLOWED_ISLANDS).

import { useState, type CSSProperties, type ReactElement } from 'react'

import { AvatarPreview, proximaDirecao, type AvatarCamada, type DirecaoAvatar } from './AvatarPreview'
import { PixelImage } from './PixelImage'

/**
 * T024 / FR-003, FR-032, SC-012 — the avatar builder: the largest island in the product.
 *
 * `onboarding.md` § *Painéis de customização* draws the screen: the preview and its ⟳ button on
 * the left with the base selector under it, and to the right one container holding every panel
 * at once — the round-3 mockup *"abandona as abas"*, so there is no tab state to keep and
 * nothing to hide. FR-003 is the catalogue it must offer in full: base `F`/`M`, 20 skin tones,
 * 10 hair colours and the nine item slots at their catalogue sizes.
 *
 * ── The catalogue is a prop, and the slot vocabulary comes with it ──────────────────────────
 *
 * The nine slot names, their order and their visitor-facing headings live in `apps/web`
 * (`CATEGORIAS_AVATAR`, and the page's own `TITULO_DO_SLOT`), which FR-018's purity boundary
 * forbids this package from importing. `AvatarPreview` met the same wall at T023 and answered
 * it the same way: the resolved data is the prop, so the vocabulary stays in one place instead
 * of being copied here and held to the original by nothing. The page reads the catalogue
 * through the choke point and hands it over; this file has no tenancy surface at all.
 *
 * ── Picker sprites up front, preview sheets only for what was chosen (FR-032) ───────────────
 *
 * Every catalogue row ships twice: `sprite` is one direction, `spriteFolhas` is the four-frame
 * sheet the preview rotates through. The pickers draw ~93 thumbnails and **all of them use
 * `sprite`**; only the handful of items a person actually chose reach `AvatarPreview`, which is
 * where the sheets are pulled. The trap is that the two render identically — frame 0 of a
 * four-frame sheet is the same picture — so `spriteFolhas ?? sprite` in a thumbnail would look
 * right on screen while quadrupling the bytes of the page CLR-004 makes us measure. Nothing
 * downstream enforces the budget, which is exactly why the shape is asserted in
 * `avatar-builder.test.ts` rather than left to review.
 *
 * ── What this island deliberately does NOT decide ───────────────────────────────────────────
 *
 * Completeness (FR-005: `oculos` and `chapeu` optional, the rest required before step 1
 * finishes) is the **page's** gate over the config this component emits, and T024b holds it to
 * a test. The island reports every change through {@link AvatarBuilderProps.onChange} and keeps
 * no opinion about when the person may continue — a builder that owned the submit would be one
 * that also had to know about step 2.
 *
 * T024b added the *rule* here as {@link avatarCompleto} / {@link escolhasFaltando} without
 * moving the *gate*: they are pure functions over a configuration and the declared slots, which
 * the page's submit calls. Keeping them beside {@link AvatarConfig} is what stops the shape and
 * the rule that reads it drifting apart; keeping them out of the component is what stops this
 * island growing a submit button and, with it, a route.
 *
 * @example
 *   <AvatarBuilder slots={SLOTS} itens={catalogo.itens} peles={catalogo.peles}
 *                  cabelos={catalogo.cabelos} larguraBase={32} alturaBase={48}
 *                  alt="Seu avatar" onChange={guardarRascunho} />
 */

/** `F` with peitos, `M` without — `onboarding.md` § *Card da base do corpo*, round 3. */
export type BaseAvatar = 'f' | 'm'

/**
 * The two bases as data, frozen.
 *
 * Declared here rather than taken as a prop, and that is the one piece of vocabulary this
 * component does own: the base is **binary by decision** (round 3 replaced four body types and
 * a height slider with it), {@link ItemAvatar} already has to name the two values to type
 * `base`, and a `bases` prop would let a page offer three of something the type says has two.
 */
export const BASES_AVATAR: readonly BaseAvatar[] = Object.freeze(['f', 'm'])

/** The labels the mockup's superseded `XX OU XY` became (round 3, 2026-08-23). */
const ROTULO_DA_BASE: Readonly<Record<BaseAvatar, string>> = Object.freeze({ f: 'F', m: 'M' })

/**
 * One cosmetic row, reduced to what a picker and a preview need.
 *
 * `sprite` and `spriteFolhas` are both optional for the reason `AvatarItem.ts` declares only
 * the first `required`: a piece can exist with picker art and no rotation sheet, and FR-007
 * says that degrades **that slot** and never the account being created.
 */
export interface ItemAvatar {
  /** The row id, which is what `avatarConfig` stores for the slot. */
  readonly id: string
  /** The catalogue name, shown beside the thumbnail and read out as the control's label. */
  readonly nome: string
  /** Which slot it belongs to — `cabelo`, `roupaCima`, … */
  readonly slot: string
  /** `avatarItem.camadaZ`: the composition order, read by `AvatarPreview` and never by a picker. */
  readonly camadaZ: number
  /** The single-direction picker art. The ONLY thing a thumbnail may draw (FR-032). */
  readonly sprite?: string
  /** The four-direction sheet, pulled only once this item is chosen. */
  readonly spriteFolhas?: string
  /** Set on `roupaCima` alone — the one slot that varies by base (FR-004). */
  readonly base?: BaseAvatar
}

/** One picker, named by the page: the slot's identity and the heading a visitor reads. */
export interface SlotAvatar {
  /** The name the catalogue, `avatarConfig` and FR-005 all use — never the heading. */
  readonly slot: string
  /** The mockup's caps heading for this panel, e.g. `PARTE DE CIMA`. */
  readonly titulo: string
}

/** One palette row. `hex` is **data, not a token** (CLR-005): a skin tone is the one colour
 *  nobody themes, because repainting it would change a person's depiction of themselves. */
export interface TomAvatar {
  readonly id: string
  readonly nome: string
  readonly hex: string
}

/**
 * What the person has built — the value `perfilMaker.avatarConfig` stores.
 *
 * `direcao` is part of it because `onboarding.md` § `avatar_config` says so: *"um item por
 * slot … + direção do preview"*. It is the one field that is a view concern, and it is stored
 * so that reopening the editor (FR-023) shows the avatar from the angle it was left at.
 */
export interface AvatarConfig {
  readonly base: BaseAvatar
  readonly pele?: string
  readonly cabeloTom?: string
  /** Slot name → chosen item id. A slot with no entry is a slot nobody has chosen yet. */
  readonly itens: Readonly<Record<string, string>>
  readonly direcao: DirecaoAvatar
}

export interface AvatarBuilderProps {
  /** The nine pickers, in the order they are stacked in — the page owns both. */
  readonly slots: readonly SlotAvatar[]
  /** Every catalogue row, for every slot. This component filters; it never truncates. */
  readonly itens: readonly ItemAvatar[]
  readonly peles: readonly TomAvatar[]
  readonly cabelos: readonly TomAvatar[]
  /** One frame's width in source pixels. No default, for `PixelImage`'s reason: a hard-coded
   *  size passes every avatar authored at it and quietly halves anything else. */
  readonly larguraBase: number
  /** One frame's height in source pixels — a body sprite is taller than it is wide. */
  readonly alturaBase: number
  /** The width the preview would like. Honoured at whole multiples only; defaults to 1x. */
  readonly larguraAlvo?: number
  /** The composed avatar is a person's depiction of themselves, so it is labelled. */
  readonly alt: string
  /** The configuration to open with — the editor's current avatar (FR-023), or step 2's
   *  `VOLTAR` bringing back what step 1 built (FR-002). */
  readonly inicial?: AvatarConfig
  /** Every change, as it happens. The page holds the draft; this island holds no route. */
  readonly onChange?: (config: AvatarConfig) => void
}

/** Nothing chosen, base `F`, facing front — the mockup's opening state, where the base selector
 *  is the *only* control showing a selection and no swatch or thumbnail is marked. */
const CONFIG_PADRAO: AvatarConfig = { base: 'f', itens: {}, direcao: 'frente' }

/**
 * The two slots a person may leave empty (FR-005).
 *
 * `onboarding.md` § `avatar_config` writes the stored shape as *"`base`, `tom_pele`,
 * `tom_cabelo`, e um item por slot: `cabelo`, `olhos`, `nariz`, `boca`, `roupa_cima`,
 * `roupa_baixo`, `sapatos`, `oculos?`, `chapeu?`"*. The two question marks are the whole of the
 * requirement: the accessories are the only optional pieces, and everything else in that list —
 * the two palettes included — is required before step 1 finishes.
 *
 * Named here rather than taken as a prop for the reason {@link BASES_AVATAR} is: this is a
 * product decision about which pieces are jewellery, not a per-lab configuration, and a page
 * free to declare its own optional set could reintroduce the gate FR-005 exists to open.
 */
export const SLOTS_OPCIONAIS: readonly string[] = Object.freeze(['oculos', 'chapeu'])

/**
 * What the avatar still needs before `SALVAR E CONTINUAR` may be pressed — named, in the order
 * the panels are stacked in, and empty when there is nothing left to choose.
 *
 * **It is never handed the catalogue, and that is the point (FR-007).** A gate that asked
 * whether each chosen piece has a drawable sprite would look identical on every screen where
 * the art loads and would lock a person out of signup on the day one file 404s — US2's *"a
 * missing accessory sprite must not block an account being created"*. Completeness is a question
 * about the configuration alone; what can be drawn is `AvatarPreview`'s problem, one slot at a
 * time.
 *
 * The slots are the caller's (`CATEGORIAS_AVATAR`, through {@link AvatarBuilderProps.slots}),
 * so a builder offering fewer panels does not gate on a panel nobody can see — and this package
 * keeps no copy of the nine names it is forbidden to import (FR-018).
 *
 * @example escolhasFaltando(config, slots) // ['pele', 'sapatos'] — the person has two to go
 */
export function escolhasFaltando(
  config: AvatarConfig,
  slots: readonly SlotAvatar[],
): string[] {
  const faltando: string[] = []
  // The palettes first, because that is the order the panels are stacked in: hair colour, skin
  // tone, then the item slots. A list the person reads top to bottom should match the screen.
  if (!config.cabeloTom) faltando.push('cabeloTom')
  if (!config.pele) faltando.push('pele')
  for (const { slot } of slots) {
    if (SLOTS_OPCIONAIS.includes(slot)) continue
    if (!config.itens[slot]) faltando.push(slot)
  }
  return faltando
}

/**
 * Whether step 1 may finish — {@link escolhasFaltando} with nothing left in it.
 *
 * The boolean the submit is disabled by; the list is what tells the person which panel to go
 * back to, and a gate with only the boolean can say *"not yet"* and nothing more.
 *
 * @example <button disabled={!avatarCompleto(config, slots)}>SALVAR E CONTINUAR →</button>
 */
export function avatarCompleto(config: AvatarConfig, slots: readonly SlotAvatar[]): boolean {
  return escolhasFaltando(config, slots).length === 0
}

/** The class names, in one place: the markup and {@link AVATAR_BUILDER_CSS} must agree, and a
 *  typo in either is a focus ring that never appears. */
const CLASSE = {
  raiz: 'fl-avatar-builder',
  trilho: 'fl-avatar-builder__trilho',
  paineis: 'fl-avatar-builder__paineis',
  painel: 'fl-avatar-builder__painel',
  titulo: 'fl-avatar-builder__titulo',
  opcoes: 'fl-avatar-builder__opcoes',
  opcao: 'fl-avatar-builder__opcao',
  escolhida: 'fl-avatar-builder__opcao--escolhida',
  swatch: 'fl-avatar-builder__swatch',
  rotacao: 'fl-avatar-builder__rotacao',
} as const

/**
 * A stylesheet, because three of this island's rules cannot be written as a style object.
 *
 * `:focus-visible` has no inline form — React has no pseudo-class — and FR-032c requires every
 * picker to be reachable and visibly focused by keyboard. The 44x44 minimum (FR-032b) travels
 * with it, on the same controls, for the reason `LikeButton` records: a panel with one
 * conforming target and ninety-two 14px ones is worse than either alone. And the selected
 * outline is a modifier class so that the *unselected* state ships no colour at all.
 *
 * No backtick and no tag syntax in these comments: a backtick would end the template literal,
 * and React writes a style element's children as raw text, so a literal tag would reach the
 * document and be matched by tests looking for the real element (tasks.md preamble, item 8).
 */
export const AVATAR_BUILDER_CSS = `
.${CLASSE.opcao} {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  color: inherit;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.${CLASSE.escolhida} {
  /* "contorno amarelo" — onboarding.md, the one selection state the mockup renders. It is
     never the only signal: every control carries aria-pressed as well. */
  border-color: var(--color-amarelo);
}
.${CLASSE.opcao}:focus-visible,
.${CLASSE.rotacao}:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
.${CLASSE.rotacao} {
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: 2px solid currentColor;
  border-radius: var(--radius-sm);
  color: inherit;
  font-family: var(--font-display);
  cursor: pointer;
}
.${CLASSE.swatch} {
  display: inline-block;
  width: var(--space-5);
  height: var(--space-5);
  border-radius: var(--radius-sm);
}
.${CLASSE.opcoes} {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}
`

const ESTILO: Record<string, CSSProperties> = {
  raiz: { display: 'grid', gap: 'var(--space-6)', alignItems: 'start' },
  trilho: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  paineis: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  painel: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.06em',
  },
}

/**
 * The options one slot offers.
 *
 * The base filter applies to `roupaCima` and to nothing else, and that asymmetry is FR-004 in
 * one line: every other slot is *"produzido em versão única de sprite"* and carries no `base`,
 * so a filter applied to all nine would empty eight of them. Reading the row's own field rather
 * than the slot's name is what keeps that rule in the data where `AvatarItem.ts` put it.
 *
 * @example opcoesDoSlot(itens, 'roupaCima', 'm') // the ten M tops, never the twenty rows
 */
function opcoesDoSlot(
  itens: readonly ItemAvatar[],
  slot: string,
  base: BaseAvatar,
): ItemAvatar[] {
  return itens.filter(
    (item) => item.slot === slot && (item.base === undefined || item.base === base),
  )
}

/**
 * The configuration with a new base, minus any piece that belonged to the other one.
 *
 * Switching the base changes *"apenas a variante da PARTE DE CIMA"* (`onboarding.md`
 * § *Estados e interações*), and the chosen top is **dropped** rather than swapped: the
 * catalogue carries no column pairing an `f` piece with its `m` twin, so there is nothing to
 * switch it *to*. Keeping the id would leave the person wearing an option their own picker no
 * longer offers — visible in the preview, unfindable in the panel, and unchangeable except by
 * switching back.
 *
 * Every other slot is untouched, which is the whole of FR-004 on this path: the eight slots
 * with no `base` on their rows survive a filter that reads the row rather than the slot name.
 */
function comBase(
  config: AvatarConfig,
  itens: readonly ItemAvatar[],
  base: BaseAvatar,
): AvatarConfig {
  const daMesmaBase = ([, id]: [string, string]): boolean => {
    const item = itens.find((linha) => linha.id === id)
    return item?.base === undefined || item.base === base
  }
  const itensRestantes = Object.entries(config.itens).filter(daMesmaBase)
  return { ...config, base, itens: Object.fromEntries(itensRestantes) }
}

/**
 * The chosen pieces as preview layers — where the four-direction sheets are pulled.
 *
 * A slot with no entry in `config.itens` contributes nothing: inventing a default would put a
 * haircut on someone who never picked one, and would download its sheet to do it.
 */
function camadasEscolhidas(
  config: AvatarConfig,
  itens: readonly ItemAvatar[],
): AvatarCamada[] {
  return Object.entries(config.itens).flatMap(([slot, id]) => {
    const item = itens.find((linha) => linha.id === id)
    if (!item) return []
    return [
      { slot, camadaZ: item.camadaZ, sprite: item.sprite, spriteFolhas: item.spriteFolhas },
    ]
  })
}

interface OpcaoProps {
  readonly chave: string
  readonly atributo: string
  readonly valor: string
  readonly rotulo: string
  readonly escolhido: boolean
  readonly onEscolher: () => void
  readonly arte?: ReactElement
}

/**
 * One option — a thumbnail or a swatch — as a control that announces its own state.
 *
 * `aria-pressed` on every option, chosen or not: the yellow outline is invisible to a screen
 * reader and to anyone who cannot separate it from the neutral one, and `onboarding.md` marks
 * the *hover/foco* state as the thing the mockup never drew.
 */
function opcao({
  chave,
  atributo,
  valor,
  rotulo,
  escolhido,
  onEscolher,
  arte,
}: OpcaoProps): ReactElement {
  return (
    <li key={chave}>
      <button
        type="button"
        {...{ [atributo]: valor }}
        className={`${CLASSE.opcao}${escolhido ? ` ${CLASSE.escolhida}` : ''}`}
        aria-pressed={escolhido}
        onClick={onEscolher}
      >
        {arte}
        {rotulo}
      </button>
    </li>
  )
}

/**
 * A slot's thumbnail, drawn from the **single-direction** sprite (FR-032).
 *
 * `alt=""`: the button beside it already carries the piece's name, and a second reading of it
 * would announce every option twice. A row with no picker art renders its name alone rather
 * than an `img` with no `src` — FR-007's *"that slot only"*, at the smallest scale it happens.
 */
function miniatura(item: ItemAvatar, larguraBase: number): ReactElement | undefined {
  if (!item.sprite) return undefined
  return <PixelImage src={item.sprite} baseWidth={larguraBase} targetWidth={larguraBase} alt="" />
}

interface PainelProps {
  readonly titulo: string
  readonly children: ReactElement[]
  readonly slot?: string
}

/** One panel: its heading and its row of options. `data-slot` carries the slot's identity into
 *  the markup so the page, the tests and `avatarConfig` all find it by the same name. */
function painel({ titulo, children, slot }: PainelProps): ReactElement {
  return (
    <section key={slot ?? titulo} data-slot={slot} style={ESTILO.painel} className={CLASSE.painel}>
      <h3 style={ESTILO.titulo} className={CLASSE.titulo}>
        {titulo}
      </h3>
      <ul className={CLASSE.opcoes}>{children}</ul>
    </section>
  )
}

/** What the left rail needs: the avatar as it stands, and the two presses it answers. */
interface TrilhoProps {
  readonly config: AvatarConfig
  readonly itens: readonly ItemAvatar[]
  readonly larguraBase: number
  readonly alturaBase: number
  readonly larguraAlvo?: number
  readonly alt: string
  readonly onGirar: () => void
  readonly onBase: (base: BaseAvatar) => void
}

/**
 * The left rail: the composed preview, the rotation, and the base under it.
 *
 * `onboarding.md` § *Trilho esquerdo* puts the ⟳ in the preview's corner and the base card
 * directly beneath, because the base is the one choice that changes the **body** rather than
 * a piece on it — everything in this rail is about the person, and everything in the panels
 * beside it is about what they are wearing.
 */
function trilho({
  config,
  itens,
  larguraBase,
  alturaBase,
  larguraAlvo,
  alt,
  onGirar,
  onBase,
}: TrilhoProps): ReactElement {
  return (
    <div className={CLASSE.trilho} style={ESTILO.trilho}>
      <AvatarPreview
        camadas={camadasEscolhidas(config, itens)}
        larguraBase={larguraBase}
        alturaBase={alturaBase}
        larguraAlvo={larguraAlvo}
        direcao={config.direcao}
        alt={alt}
      />
      <button
        type="button"
        data-rotacao="proxima"
        className={CLASSE.rotacao}
        aria-label="Girar o avatar"
        onClick={onGirar}
      >
        ⟳
      </button>
      {painel({
        titulo: 'BASE',
        children: BASES_AVATAR.map((base) =>
          opcao({
            chave: base,
            atributo: 'data-base',
            valor: base,
            rotulo: ROTULO_DA_BASE[base],
            escolhido: config.base === base,
            onEscolher: () => onBase(base),
          }),
        ),
      })}
    </div>
  )
}

/** The customisation container: the two palettes and one picker per declared slot. */
interface PaineisProps {
  readonly slots: readonly SlotAvatar[]
  readonly itens: readonly ItemAvatar[]
  readonly peles: readonly TomAvatar[]
  readonly cabelos: readonly TomAvatar[]
  readonly config: AvatarConfig
  readonly larguraBase: number
  readonly onItem: (slot: string, id: string) => void
  readonly onPele: (id: string) => void
  readonly onCabeloTom: (id: string) => void
}

/**
 * Every panel, in one container and all visible at once.
 *
 * *"todos os painéis ficam visíveis simultaneamente dentro de um único cartão-contêiner"* — the
 * round-3 mockup dropped the `CORPO/CABELO/ROSTO/ROUPAS/ACESSÓRIOS` tabs, so there is nothing
 * to hide behind a tab and no state deciding which one is open. The slot order is the page's
 * (`CATEGORIAS_AVATAR` calls it *"the order the builder stacks its pickers in"*), never this
 * file's and never the order the catalogue rows arrived in.
 */
function paineisDeCustomizacao({
  slots,
  itens,
  peles,
  cabelos,
  config,
  larguraBase,
  onItem,
  onPele,
  onCabeloTom,
}: PaineisProps): ReactElement {
  return (
    <div className={CLASSE.paineis} style={ESTILO.paineis}>
      {painelDeTons({
        titulo: 'TONS DE CABELO',
        atributo: 'data-tom-cabelo',
        tons: cabelos,
        escolhido: config.cabeloTom,
        onEscolher: onCabeloTom,
      })}
      {painelDeTons({
        titulo: 'TONS DE PELE',
        atributo: 'data-tom-pele',
        tons: peles,
        escolhido: config.pele,
        onEscolher: onPele,
      })}
      {slots.map(({ slot, titulo }) =>
        painel({
          slot,
          titulo,
          children: opcoesDoSlot(itens, slot, config.base).map((item) =>
            opcao({
              chave: item.id,
              atributo: 'data-item',
              valor: item.id,
              rotulo: item.nome,
              escolhido: config.itens[slot] === item.id,
              onEscolher: () => onItem(slot, item.id),
              arte: miniatura(item, larguraBase),
            }),
          ),
        }),
      )}
    </div>
  )
}

/**
 * `/criar-conta` step 1's builder, and the same component reopened from Minha Conta (FR-023).
 *
 * One `useState` and nothing else: the configuration is a single value, and splitting it into
 * a hook per slot would be eleven hooks whose only relationship is that every one of them has
 * to be handed to `onChange` together.
 */
export function AvatarBuilder({
  slots,
  itens,
  peles,
  cabelos,
  larguraBase,
  alturaBase,
  larguraAlvo,
  alt,
  inicial,
  onChange,
}: AvatarBuilderProps): ReactElement {
  const [config, setConfig] = useState<AvatarConfig>(inicial ?? CONFIG_PADRAO)

  /** Every change goes through here, so the page is told exactly once per press and can never
   *  hold a draft the screen disagrees with (FR-002 — step 2's `VOLTAR` loses nothing). */
  const aplicar = (proximo: AvatarConfig): void => {
    setConfig(proximo)
    onChange?.(proximo)
  }

  return (
    <div className={CLASSE.raiz} style={ESTILO.raiz}>
      <style href="fablab-avatar-builder" precedence="default">
        {AVATAR_BUILDER_CSS}
      </style>
      {trilho({
        config,
        itens,
        larguraBase,
        alturaBase,
        larguraAlvo,
        alt,
        onGirar: () => aplicar({ ...config, direcao: proximaDirecao(config.direcao) }),
        onBase: (base) => aplicar(comBase(config, itens, base)),
      })}
      {paineisDeCustomizacao({
        slots,
        itens,
        peles,
        cabelos,
        config,
        larguraBase,
        onItem: (slot, id) => aplicar({ ...config, itens: { ...config.itens, [slot]: id } }),
        onPele: (id) => aplicar({ ...config, pele: id }),
        onCabeloTom: (id) => aplicar({ ...config, cabeloTom: id }),
      })}
    </div>
  )
}

interface PainelDeTonsProps {
  readonly titulo: string
  readonly atributo: string
  readonly tons: readonly TomAvatar[]
  readonly escolhido?: string
  readonly onEscolher: (id: string) => void
}

/** A row of swatches. The colour is the row's own `hex` — data from the database (CLR-005), so
 *  no literal is written here and the colour fence is untouched. */
function painelDeTons({
  titulo,
  atributo,
  tons,
  escolhido,
  onEscolher,
}: PainelDeTonsProps): ReactElement {
  return painel({
    titulo,
    children: tons.map((tom) =>
      opcao({
        chave: tom.id,
        atributo,
        valor: tom.id,
        rotulo: tom.nome,
        escolhido: escolhido === tom.id,
        onEscolher: () => onEscolher(tom.id),
        arte: <span aria-hidden="true" className={CLASSE.swatch} style={{ background: tom.hex }} />,
      }),
    ),
  })
}
