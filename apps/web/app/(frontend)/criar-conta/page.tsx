import type { CSSProperties, ReactElement } from 'react'

import { notFound } from 'next/navigation'

import { EmptyState, type ItemAvatar, type SlotAvatar, type TomAvatar } from '@fablab/ui'

import {
  CATEGORIAS_AVATAR,
  LINHAS_AVATAR,
  type CategoriaAvatar,
} from '../../../collections/avatar/AvatarItem'
import { TOTAL_TONS_DE_CABELO } from '../../../collections/avatar/TomDeCabelo'
import { TOTAL_TONS_DE_PELE } from '../../../collections/avatar/TomDePele'
import { TenantUnresolvedError } from '../../../lib/tenancy/errors'
// Deep import, exactly as `layout.tsx` and every listing does it and for the same reason: the
// anonymous read path is not re-exported from `lib/tenancy`'s index, because it runs with
// `overrideAccess: true` and that unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'
// The parameter's name and the bound on what may travel in it are step 2's, and they are
// **imported rather than restated**: the draft is written by one page and read by the other, so a
// second spelling of `avatar` or a second idea of "too large" is one half of the round trip
// quietly starting to carry nothing (`dados/page.tsx` says so where it declares them). Only the
// destination stays local — FR-002 gives the two `VOLTAR`s different ones on purpose.
import { PARAM_AVATAR, rascunhoDoAvatar } from './dados/page'
// The island this page mounts (T024c). It holds the configuration `AvatarBuilder` emits, which
// is the only place the gate FR-005 asks for can read it from.
import { CLASSE_DO_PASSO, PassoDoAvatar } from './PassoDoAvatar'

/**
 * T022 / FR-001, FR-002, FR-003, US2 — step 1 of `/criar-conta`: the avatar builder's shell.
 *
 * `onboarding.md` § *Estrutura da página* draws this screen: the step heading `CRIE SEU AVATAR`
 * with *"Personalize seu personagem maker do seu jeito!"*, a left rail (preview, then `VOLTAR`
 * and `SALVAR E CONTINUAR →`) and, to its right, one container holding every customisation
 * panel at once — the mockup *"abandona as abas"*. Round 4 (2026-08-24) put the **`1 2`
 * indicator** back on the screen after the mockup dropped it, now with two steps rather than
 * three.
 *
 * ── What this file is, and what it deliberately is not ──────────────────────────────────────
 *
 * It is the **shell**: the frame, and the one thing only a server component can do — read the
 * catalogue. Selection state, the composed preview and the four-direction rotation belong to
 * the island (`AvatarBuilder`, T024) over a server-renderable `AvatarPreview` (T023), and since
 * T024c the page *mounts* it — through `PassoDoAvatar`, which holds the configuration the builder
 * emits and gates `SALVAR E CONTINUAR` on it (FR-005). This file still carries **no `use client`
 * of its own** (FR-024): it reads the catalogue, hands it over as data, and renders the heading,
 * `VOLTAR` and the failure path around it.
 *
 * ── Why the read is the whole point ─────────────────────────────────────────────────────────
 *
 * The catalogue is **global** (CLR-001) and the visitor here has no account (FR-003), so this
 * page is the first production caller of `PUBLIC_GLOBAL_CATALOGUE` — the three-slug allow-list
 * in `lib/tenancy/public-payload.ts`. Before it existed, `getPublicScopedPayload` refused every
 * `global` collection by construction and the plan's *"reads the catalogue through the choke
 * point"* named a gate that threw; T006's verification round found it. Collection-level `read`
 * on all three stays `masterOnly()`, and that is not an oversight: the anonymous client runs
 * with `overrideAccess: true`, so collection access is never consulted on this path, and an
 * open boolean there would buy nothing but unauthenticated enumeration of `/api/<slug>`.
 *
 * Reading it rather than typing it is what makes the catalogue **one** catalogue: the same rows
 * the admin edits and the seed writes, held to the same sizes `CATEGORIAS_AVATAR`,
 * `TOTAL_TONS_DE_PELE` and `TOTAL_TONS_DE_CABELO` fix. A page with its own twenty swatches
 * would look identical on the day it went stale.
 */

export const metadata = { title: 'CRIE SEU AVATAR — Fab Lab CITe Bauru' }

/** This step's own path. The retry below is built from it, so the route moves in one edit. */
export const CRIAR_CONTA_PATH = '/criar-conta'

/**
 * Step 2 — personal data, the terms checkbox and the submit (T026).
 *
 * **Handed to the island as a string** rather than turned into an href here (T024c). The draft
 * that travels forward is the avatar the person just built, and that value exists only in the
 * client, so the link has to be assembled where the configuration is — and a server component may
 * hand a client one data, never a function. What does not change is the rule it is used under:
 * `encodeURIComponent`, never concatenation, because a configuration contains `&`, `#` and `=`
 * and a hand-built query truncates at the first of them.
 */
export const PASSO_2_PATH = `${CRIAR_CONTA_PATH}/dados`

/**
 * Where `VOLTAR` goes from **this** step (FR-002).
 *
 * PO, 2026-08-24: step 1's `VOLTAR` leaves the flow for the Home. It is step 2's `VOLTAR` that
 * comes back here, with the avatar intact — a different button on a different page, and the
 * reason the two are never written as one shared constant.
 */
const HOME_PATH = '/'

const PASSO_ATUAL = 1
const TOTAL_DE_PASSOS = 2

/** One palette row — `tomDePele` and `tomDeCabelo` are the same three columns (palette.ts).
 *  Structural rather than imported from `payload-types.ts`, which is gitignored: a page that
 *  imported a generated type would compile locally and fail CI. */
type TomDoc = { readonly id?: string | number; readonly nome?: string; readonly hex?: string }

/**
 * One cosmetic item.
 *
 * `sprite`/`spriteFolhas` are still deliberately absent: they are `relationship` columns, so
 * reading them means raising `depth` and populating `midiaImagem` for ~93 rows. The builder
 * draws a row with no picker art as its name alone — FR-007's *"that slot only"* — so the
 * catalogue is operable before the art is wired, and the populate lands with the sprites rather
 * than ahead of them.
 */
type ItemDoc = {
  /** Payload's id. A number on Postgres, and the configuration stores strings — see
   *  {@link itensDoBuilder}, where the two are reconciled once. */
  readonly id?: string | number
  readonly nome?: string
  readonly categoria?: string
  /** `avatarItem.camadaZ`: the composition order `AvatarPreview` stacks the chosen pieces in. */
  readonly camadaZ?: number
  /**
   * `'f'` or `'m'` on `roupaCima` and absent everywhere else (FR-004).
   *
   * Read, not ignored: this column is the difference between the ten tops `onboarding.md`
   * fixes and the twenty rows that store them. It is handed to the builder as `base`, which
   * filters on it — see {@link itensDoBuilder}.
   */
  readonly compativelBase?: string | null
}

/** The three reads, as one value the render walks. `null` is *"the catalogue could not be
 *  read"*, which is a different page from *"the catalogue is empty"*. */
type Catalogo = {
  readonly peles: readonly TomDoc[]
  readonly cabelos: readonly TomDoc[]
  readonly itens: readonly ItemDoc[]
}

/**
 * Every `avatarItem` row the catalogue holds — the limit the item read asks for.
 *
 * `LINHAS_AVATAR` and not `CATEGORIAS_AVATAR`: the first is options *offered* per slot and the
 * second is rows *stored*, and they differ for `roupaCima`, whose ten pieces each exist as an
 * `f` and an `m` sprite (FR-004). Asking for the option count would leave ten rows unread.
 */
const TOTAL_DE_ITENS = Object.values(LINHAS_AVATAR).reduce((soma, linhas) => soma + linhas, 0)

/**
 * The visitor-facing heading for each slot (`onboarding.md` § *Painéis de customização*).
 *
 * Not `AvatarItem.ts`'s admin labels, and the difference is deliberate: that vocabulary names
 * the column for the lab team (*"Roupa (cima)"*), while these are the mockup's caps headings
 * for the person building an avatar (`PARTE DE CIMA`). Two audiences, two strings; sharing one
 * would mean an admin rename silently retyping this screen.
 *
 * Keyed by {@link CategoriaAvatar}, so a tenth slot is a compile error here rather than a panel
 * that renders with no title.
 */
const TITULO_DO_SLOT: Readonly<Record<CategoriaAvatar, string>> = Object.freeze({
  cabelo: 'CABELO',
  olhos: 'OLHOS',
  nariz: 'NARIZ',
  boca: 'BOCA',
  roupaCima: 'PARTE DE CIMA',
  roupaBaixo: 'PARTE DE BAIXO',
  sapatos: 'SAPATOS',
  oculos: 'ÓCULOS',
  chapeu: 'CHAPÉUS',
})

/** The nine slots in their declared order — *"the order the builder stacks its pickers in"*,
 *  which `CATEGORIAS_AVATAR` records and this page must not re-decide. */
const SLOTS = Object.keys(CATEGORIAS_AVATAR) as CategoriaAvatar[]

/**
 * The whole catalogue, through the anonymous choke point.
 *
 * Three reads rather than one: they are three collections, and the builder needs all of them
 * before it can draw a single panel. `Promise.all` because none depends on another.
 *
 * **Each limit is the catalogue's own size**, taken from the constant that defines it. Payload's
 * default is 10 — under it the visitor would be offered half the skin tones and a tenth of the
 * items, with nothing on the page saying so. The catalogue has already half-shrunk once by
 * exactly that kind of silence (tasks.md preamble, item 2), which is why the sizes are exported
 * constants and not integers retyped here.
 */
async function lerCatalogo(): Promise<Catalogo> {
  const db = await getPublicScopedPayloadForRSC()
  const [peles, cabelos, itens] = await Promise.all([
    // `ordem` is what the column is for: the skin grid runs *"do mais claro ao mais escuro"* and
    // the hair row has a fixed sequence, neither of which survives the database's own order.
    db.find<TomDoc>({ collection: 'tomDePele', depth: 0, limit: TOTAL_TONS_DE_PELE, sort: 'ordem' }),
    db.find<TomDoc>({
      collection: 'tomDeCabelo',
      depth: 0,
      limit: TOTAL_TONS_DE_CABELO,
      sort: 'ordem',
    }),
    // By `nome`, and not by `camadaZ`: the layer is the *composition* order (T023's), not the
    // order the thumbnails are offered in. `avatarItem` carries no `ordem` column, so the name
    // is the only key that makes the grid the same on two loads.
    db.find<ItemDoc>({ collection: 'avatarItem', depth: 0, limit: TOTAL_DE_ITENS, sort: 'nome' }),
  ])
  return { peles: peles.docs, cabelos: cabelos.docs, itens: itens.docs }
}

/**
 * Run the catalogue read, and answer the two failures a visitor can actually meet.
 *
 * An **unresolved host** is 404 for the whole site, the same answer `layout.tsx` gives: serving
 * one organization's page on another's hostname is the failure feature 000's US4 forbids, and it
 * is worse than an error because nobody would notice it. Anything else is an outage of this one
 * read: the shell stays on screen so the visitor still has a way out of the flow, which is the
 * same split every listing makes.
 */
async function lerOuFalhar(): Promise<Catalogo | null> {
  try {
    return await lerCatalogo()
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) notFound()
    console.warn('[criar-conta] the avatar catalogue could not be read.', erro)
    return null
  }
}

/**
 * `1 2` (FR-001), and which of the two the visitor is on.
 *
 * `aria-current="step"` rather than colour alone: the indicator's whole content is two numerals,
 * so a visitor who cannot see the fill has nothing else to tell them where they are.
 */
function indicadorDePassos(): ReactElement {
  const passos = Array.from({ length: TOTAL_DE_PASSOS }, (_, indice) => indice + 1)
  return (
    <nav aria-label={`Passo ${PASSO_ATUAL} de ${TOTAL_DE_PASSOS}`} style={ESTILO.passos}>
      {passos.map((passo) => (
        <span
          key={passo}
          aria-current={passo === PASSO_ATUAL ? 'step' : undefined}
          style={passo === PASSO_ATUAL ? ESTILO.passoAtual : ESTILO.passo}
        >
          {passo}
        </span>
      ))}
    </nav>
  )
}

/** The step heading (`onboarding.md` § *Cabeçalho da etapa*). */
function cabecalho(): ReactElement {
  return (
    <header style={ESTILO.cabecalho}>
      {indicadorDePassos()}
      <h1 style={ESTILO.titulo}>CRIE SEU AVATAR</h1>
      <p style={ESTILO.subtitulo}>Personalize seu personagem maker do seu jeito!</p>
    </header>
  )
}

/**
 * The catalogue rows as the builder's own shapes.
 *
 * Two vocabularies meet here and neither is made to win: `avatarItem` calls the slot `categoria`
 * and the base column `compativelBase`, while `@fablab/ui` — which FR-018 forbids from importing
 * anything in this app — calls them `slot` and `base`. The translation is one function, so a
 * rename on either side is a compile error in one place rather than a panel that silently stops
 * filtering.
 *
 * `String(id)`: Payload ids are numbers on Postgres and a configuration stores strings, and a
 * `23` that never equals `'23'` is a chosen item that draws as unchosen for ever.
 */
function itensDoBuilder(itens: readonly ItemDoc[]): ItemAvatar[] {
  return itens.map((item) => ({
    id: String(item.id ?? ''),
    nome: item.nome ?? '',
    slot: item.categoria ?? '',
    camadaZ: item.camadaZ ?? 0,
    // Only the two values FR-004 allows travel as `base`; anything else is a row with no base,
    // which is the reading that keeps the other eight panels full rather than emptying them.
    base: item.compativelBase === 'f' || item.compativelBase === 'm' ? item.compativelBase : undefined,
  }))
}

/** One palette row, likewise. `hex` is **data, not a token** (CLR-005) — a skin tone is the one
 *  colour nobody themes, because repainting it would change a person's depiction of themselves. */
function tonsDoBuilder(tons: readonly TomDoc[]): TomAvatar[] {
  return tons.map((tom) => ({ id: String(tom.id ?? ''), nome: tom.nome ?? '', hex: tom.hex ?? '' }))
}

/** The nine pickers with the headings a visitor reads — this page's vocabulary, handed over
 *  rather than copied into the package FR-018 keeps free of it. */
const SLOTS_DO_BUILDER: readonly SlotAvatar[] = SLOTS.map((slot) => ({
  slot,
  titulo: TITULO_DO_SLOT[slot],
}))

/**
 * One avatar frame, in source pixels.
 *
 * `AvatarPreview` takes no default and says why: *"a hard-coded size passes every avatar authored
 * at it and quietly halves anything else"*. The catalogue carries no dimension column, so the
 * size the art is authored at is declared once, here, at the proportions that component's own
 * example documents — a body sprite is taller than it is wide.
 */
const LARGURA_DO_QUADRO = 32
const ALTURA_DO_QUADRO = 48

/** The width the preview would like. A whole multiple of the frame, because anything else is a
 *  blurred pixel grid — `clampScale` rounds it down to one anyway. */
const LARGURA_DO_PREVIEW = LARGURA_DO_QUADRO * 6

/**
 * The builder, mounted over the catalogue this page read (T024c, FR-005).
 *
 * Everything crossing this call is **data**: nine slot names with their headings, the rows, the
 * frame size, and the two strings that spell step 2. The configuration and the gate over
 * `SALVAR E CONTINUAR` are the island's, because both exist only after a press — which is the
 * whole reason FR-005 could not be enforced from this file, and why the rule shipped at T024b
 * with no caller until the mount existed to give it one.
 */
function construtor(catalogo: Catalogo, rascunho: string | null): ReactElement {
  return (
    <PassoDoAvatar
      slots={SLOTS_DO_BUILDER}
      itens={itensDoBuilder(catalogo.itens)}
      peles={tonsDoBuilder(catalogo.peles)}
      cabelos={tonsDoBuilder(catalogo.cabelos)}
      larguraBase={LARGURA_DO_QUADRO}
      alturaBase={ALTURA_DO_QUADRO}
      larguraAlvo={LARGURA_DO_PREVIEW}
      alt="Seu avatar, como está sendo montado"
      rascunho={rascunho}
      passo2Path={PASSO_2_PATH}
      paramAvatar={PARAM_AVATAR}
      voltar={voltar()}
    />
  )
}

/**
 * `VOLTAR` — and from **this** step it leaves the flow for the Home (FR-002).
 *
 * Rendered here and handed to the island rather than rebuilt inside it, so the copy, the
 * destination and the secondary treatment have ONE definition across both paths: the built page,
 * and the one where the catalogue read failed and the island never mounts at all.
 *
 * An anchor wearing a button's identity, for the reason the Home's CTA records: a `<button>`
 * navigates nowhere without a handler, and a handler here would make the shell an island.
 */
function voltar(): ReactElement {
  return (
    <a href={HOME_PATH} style={ESTILO.voltar}>
      VOLTAR
    </a>
  )
}

/** The read failed: report it in place, with a retry that reloads this same step — and `VOLTAR`
 *  still on screen, because the island that normally carries it never mounts here and a visitor
 *  who meets an outage must have something to press other than the browser's back button. */
function falhaDeLeitura(): ReactElement {
  return (
    <div style={ESTILO.falha}>
      <EmptyState
        surface="light"
        variant="erro"
        titulo="Não foi possível carregar o catálogo do avatar."
        descricao="Recarregue a página para tentar de novo."
        acao={{ label: 'Tentar novamente', href: CRIAR_CONTA_PATH }}
      />
      {voltar()}
    </div>
  )
}

/** The query, if this step was given one. Optional, and defaulted: step 1 is the **entry point**
 *  of the flow and is reached with no query far more often than with one, so rendering it with no
 *  argument at all must be the same page as rendering it with an empty query. */
type CriarContaPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/criar-conta` — step 1, the avatar.
 *
 * The draft is **never parsed here** — it is carried. `rascunhoDoAvatar` bounds it and this page
 * re-emits it; the shape is checked where it crosses into the database (T027), which is the one
 * place a second validator would not be a second source of truth.
 *
 * @example /criar-conta  (a visitor with no account; the catalogue is read anonymously)
 * @example /criar-conta?avatar=%7B%22base%22%3A%22f%22%7D  (returning from step 2's `VOLTAR`)
 */
export default async function Page(props: CriarContaPageProps = {}): Promise<ReactElement> {
  const catalogo = await lerOuFalhar()
  const rascunho = rascunhoDoAvatar((await props.searchParams)?.[PARAM_AVATAR])

  return (
    <main style={ESTILO.pagina_}>
      {cabecalho()}
      {catalogo === null ? falhaDeLeitura() : construtor(catalogo, rascunho)}
      <p style={ESTILO.nota}>As opções podem ser combinadas livremente. Solte sua criatividade!</p>
      <style href="fablab-criar-conta" precedence="default">
        {CRIAR_CONTA_CSS}
      </style>
    </main>
  )
}

/** Only what a style object cannot express — React has no media query. The rail sits above the
 *  panels on a narrow screen and beside them from the tablet breakpoint up, which is the mockup's
 *  two-column desktop arrangement without a second layout to maintain.
 *
 *  The grid it applies to is `AvatarBuilder`'s own root, which ships as a single column: the two
 *  columns are this page's layout decision, not the component's, so the rule is written here and
 *  reaches the element the island mounts first — the actions row follows it. The class comes from
 *  {@link CLASSE_DO_PASSO} rather than a literal, so the markup and this stylesheet cannot drift. */
const CRIAR_CONTA_CSS = `
@media (min-width: 834px) {
  .${CLASSE_DO_PASSO} > :first-child { grid-template-columns: minmax(240px, 1fr) 3fr; }
}
`

/**
 * Every style this page declares, in one object.
 *
 * Style objects rather than a stylesheet, for the reason every page here records: the suite runs
 * at `node` with no DOM, so a class name would be assertable only as text in two files — a check
 * that stays green when the rule behind it is wrong. Every colour is a token (FR-027); the one
 * colour that is not is the `hex` a palette row carries, which is data (CLR-005) and arrives
 * from the database rather than from this file.
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore, as the listings write it: `pagina` also names a query parameter in this
  // codebase, and two meanings for one word is how the wrong one gets used.
  pagina_: {
    // A light page (`onboarding.md`: *"fundo geral claro … com texto navy"*). The surface ROLES
    // are re-declared rather than a colour painted, so every component inside — the empty state,
    // its retry button — follows the region into the light treatment.
    '--surface-page': 'var(--surface-inverted)',
    '--surface-card': 'var(--surface-inverted)',
    // The `:root` default ring is the accent, which scores ~2:1 on this white page — invisible
    // on exactly the controls a keyboard visitor is aiming for. Navy is 16.63:1 here and is the
    // ink the page already writes in.
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-page)',
    color: 'var(--text-on-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
    padding: 'var(--space-8) var(--space-5) var(--space-10)',
  } as CSSProperties,
  cabecalho: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  passos: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center' },
  passo: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--space-7)',
    height: 'var(--space-7)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  passoAtual: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--space-7)',
    height: 'var(--space-7)',
    // The accent fill with navy ink: the same pair the canonical primary uses, so the current
    // step reads as the active thing on a page whose only other fill is that button.
    background: 'var(--color-primary)',
    color: 'var(--color-navy)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
  },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  subtitulo: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' },
  /** The failure path's own stack: the empty state, then the way out under it. */
  falha: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-5)' },
  voltar: {
    // The secondary of `onboarding.md` § *Trilho esquerdo*: navy fill, light text. It is not
    // `Button`: that component is the canonical primary and has no variant, because the
    // secondary is still `(proposta)` in the identity document.
    background: 'var(--color-navy)',
    color: 'var(--color-claro)',
    '--focus-ring-color': 'var(--color-claro)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-6)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    textDecoration: 'none',
    // FR-032b: 44px declared, and `inline-flex` with the label centred so the extra height is
    // padding around the words rather than a gap under them. `inline-block` would honour the
    // minimum and leave the text at the top of the box.
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
  } as CSSProperties,
  nota: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    fontStyle: 'italic',
  },
}
