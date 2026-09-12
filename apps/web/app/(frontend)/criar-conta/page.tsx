import type { CSSProperties, ReactElement } from 'react'

import { notFound } from 'next/navigation'

import { EmptyState, PRIMARY_BUTTON_STYLE } from '@fablab/ui'

import {
  CATEGORIA_COM_BASE,
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
 * the island (`AvatarBuilder`, T024) over a server-renderable `AvatarPreview` (T023), which is
 * why the panels below are plain lists and the preview is an empty frame rather than a picture
 * of nothing. The page therefore ships **no JavaScript of its own** (FR-024).
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

/** Step 2 — personal data, the terms checkbox and the submit (T026). */
export const PASSO_2_PATH = `${CRIAR_CONTA_PATH}/dados`

/**
 * On to step 2, carrying the draft this step was handed (FR-002).
 *
 * The mirror of `dados/page.tsx`'s `hrefDoVoltar`, and the other half of what "the avatar is
 * intact" means: step 2's `VOLTAR` brings the configuration back here, and without this it dies
 * on arrival — the visitor returns to the form having lost everything they built, which is a
 * worse failure than never going back at all because nothing on screen says so.
 *
 * `encodeURIComponent`, never concatenation: a configuration contains `&`, `#` and `=`, and a
 * hand-built query truncates at the first of them — half an avatar looks far more like a success
 * than like a bug.
 *
 * @example hrefDoPasso2('{"a":1&2}') // '/criar-conta/dados?avatar=%7B%22a%22%3A1%262%7D'
 */
export function hrefDoPasso2(rascunho: string | null): string {
  if (rascunho === null) return PASSO_2_PATH
  return `${PASSO_2_PATH}?${PARAM_AVATAR}=${encodeURIComponent(rascunho)}`
}

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
type TomDoc = { readonly nome?: string; readonly hex?: string }

/** One cosmetic item. `sprite`/`spriteFolhas` are deliberately absent: the picker sheets and
 *  the preview sheets arrive with T023/T024, and a `depth` raised for nobody is a populate
 *  nobody reads. */
type ItemDoc = {
  readonly nome?: string
  readonly categoria?: string
  /**
   * `'f'` or `'m'` on `roupaCima` and absent everywhere else (FR-004).
   *
   * Read, not ignored: this column is the difference between the ten tops `onboarding.md`
   * fixes and the twenty rows that store them. See {@link opcoesDoSlot}.
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
 * The left rail: the preview frame, then the two buttons (`onboarding.md` § *Trilho esquerdo*).
 *
 * The frame is **empty and `aria-hidden`**, not a placeholder picture and not a labelled image:
 * the composition is T023's and the rotation T024's, and announcing *"pré-visualização do
 * avatar"* over an empty box describes something that is not there yet. The base selector and
 * the `NOME DO AVATAR` field are the same deferral — the first is selection state, the second is
 * the person's name and belongs to step 2's form, which carries it (round 3, 2026-08-23).
 *
 * Both buttons are **anchors wearing a button's identity**, for the reason the Home's CTA
 * records: a `<button>` navigates nowhere without a handler, and a handler here would make the
 * shell an island to do what an `href` does for free.
 */
function trilho(rascunho: string | null): ReactElement {
  return (
    <div style={ESTILO.trilho}>
      <div style={ESTILO.preview} aria-hidden="true" />
      <div style={ESTILO.acoes}>
        {/* `VOLTAR` never carries the draft, and `SALVAR E CONTINUAR` always does: the first
            leaves signup for the Home, so there is nothing for an avatar to be intact *for*. */}
        <a href={HOME_PATH} style={ESTILO.voltar}>
          VOLTAR
        </a>
        <a href={hrefDoPasso2(rascunho)} style={ESTILO.continuar}>
          SALVAR E CONTINUAR →
        </a>
      </div>
    </div>
  )
}

/** One swatch: the colour the row carries, and the name beside it.
 *
 *  The `hex` is **data, not a token** (CLR-005) — a skin tone is the one colour in the product
 *  nobody themes, because repainting it would change a person's depiction of themselves. It
 *  arrives from the database, so no literal is written here and the colour fence is untouched. */
function swatch(tom: TomDoc, indice: number): ReactElement {
  return (
    <li key={tom.nome ?? indice} style={ESTILO.opcao}>
      <span aria-hidden="true" style={{ ...ESTILO.swatch, background: tom.hex }} />
      {tom.nome ?? ''}
    </li>
  )
}

/** A row of swatches under its heading — `TONS DE CABELO` above the panels, `TONS DE PELE`
 *  inside them. */
function painelDeTons(titulo: string, tons: readonly TomDoc[]): ReactElement {
  return (
    <section style={ESTILO.painel}>
      <h2 style={ESTILO.painelTitulo}>{titulo}</h2>
      <ul style={ESTILO.opcoes}>{tons.map(swatch)}</ul>
    </section>
  )
}

/**
 * One slot's panel.
 *
 * `data-slot` carries the slot's identity into the markup, so the island mounting over this
 * shell — and the tests reading it — find the nine panels by the same name the catalogue,
 * `avatarConfig` and FR-005 use, rather than by a heading that is editorial copy.
 *
 * A slot with no rows says so instead of rendering an empty list: FR-007's rule is that a
 * missing sprite degrades **that slot only** and never blocks an account being created, and a
 * silently absent panel is the version of that failure nobody can see.
 */
/**
 * The base the builder opens on — `F`, the one `design/criar-conta-passo-1.png` shows selected.
 *
 * A constant here and state in `AvatarBuilder` (T024): this shell is server-rendered and the
 * selector's state is the island's, but the shell still has to pick which of the two sets of
 * tops it prints, and printing both is what this constant exists to prevent.
 */
const BASE_PADRAO = 'f'

/**
 * The options a slot OFFERS, which is not the rows it stores.
 *
 * `roupaCima` is the one slot that varies by base: `onboarding.md` § *Card `ROUPAS`* fixes a
 * *"catálogo de **10**"* and then *"cada peça tem versão `F` (com peitos) e `M`"*, so ten
 * garments live as twenty rows. Rendering the rows put **twenty tops** in the picker — every
 * garment twice, and indistinguishably, because `compativelBase` was not even in `ItemDoc`.
 *
 * The test could not see it: the fixture held a single `roupaCima` row, so no `f`/`m` pair was
 * ever rendered, and the count assertion compared the `<li>` count against *rows returned* —
 * encoding the wrong rule so firmly that the correct behaviour would have failed it.
 *
 * Every other slot is *"produzido em versão única de sprite"*, so a row IS an option there and
 * filtering on a column those rows leave null would empty the panel.
 */
function opcoesDoSlot(
  categoria: CategoriaAvatar,
  itens: readonly ItemDoc[],
  base: string,
): readonly ItemDoc[] {
  const doSlot = itens.filter((item) => item.categoria === categoria)
  if (categoria !== CATEGORIA_COM_BASE) return doSlot
  return doSlot.filter((item) => item.compativelBase === base)
}

function painelDeSlot(categoria: CategoriaAvatar, itens: readonly ItemDoc[]): ReactElement {
  const doSlot = opcoesDoSlot(categoria, itens, BASE_PADRAO)
  return (
    <section key={categoria} data-slot={categoria} style={ESTILO.painel}>
      <h2 style={ESTILO.painelTitulo}>{TITULO_DO_SLOT[categoria]}</h2>
      {doSlot.length === 0 ? (
        <p style={ESTILO.vazio}>Nenhuma opção disponível.</p>
      ) : (
        <ul style={ESTILO.opcoes}>
          {doSlot.map((item, indice) => (
            <li key={item.nome ?? indice} style={ESTILO.opcao}>
              {item.nome ?? ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Every panel, in one container.
 *
 * *"todos os painéis ficam visíveis simultaneamente dentro de um único cartão-contêiner"* — the
 * round-3 mockup dropped the `CORPO/CABELO/ROSTO/ROUPAS/ACESSÓRIOS` tabs, so there is nothing
 * here to hide behind a tab and no state to decide which one is open.
 */
function paineis(catalogo: Catalogo): ReactElement {
  return (
    <>
      {painelDeTons('TONS DE CABELO', catalogo.cabelos)}
      {painelDeTons('TONS DE PELE', catalogo.peles)}
      {SLOTS.map((categoria) => painelDeSlot(categoria, catalogo.itens))}
    </>
  )
}

/** The read failed: report it in place, with a retry that reloads this same step. */
function falhaDeLeitura(): ReactElement {
  return (
    <EmptyState
      surface="light"
      variant="erro"
      titulo="Não foi possível carregar o catálogo do avatar."
      descricao="Recarregue a página para tentar de novo."
      acao={{ label: 'Tentar novamente', href: CRIAR_CONTA_PATH }}
    />
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
      <div className={CLASSE.colunas} style={ESTILO.colunas}>
        {trilho(rascunho)}
        <div style={ESTILO.container}>
          {catalogo === null ? falhaDeLeitura() : paineis(catalogo)}
        </div>
      </div>
      <p style={ESTILO.nota}>As opções podem ser combinadas livremente. Solte sua criatividade!</p>
      <style href="fablab-criar-conta" precedence="default">
        {CRIAR_CONTA_CSS}
      </style>
    </main>
  )
}

/** The class names, in one place: the markup and {@link CRIAR_CONTA_CSS} must agree, and a typo
 *  in either is a breakpoint that switches nothing. */
const CLASSE = { colunas: 'fl-criar-conta__colunas' } as const

/** Only what a style object cannot express — React has no media query. The rail sits above the
 *  panels on a narrow screen and beside them from the tablet breakpoint up, which is the
 *  mockup's two-column desktop arrangement without a second layout to maintain. */
const CRIAR_CONTA_CSS = `
@media (min-width: 834px) {
  .${CLASSE.colunas} { grid-template-columns: minmax(240px, 1fr) 3fr; }
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
  colunas: { display: 'grid', gap: 'var(--space-6)', alignItems: 'start' },
  trilho: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' },
  preview: {
    // The frame the composed avatar lands in (T023). It holds its own height so the layout does
    // not jump when the preview arrives, and draws nothing until it does.
    minHeight: 'var(--space-12)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-hard)',
  },
  acoes: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' },
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
    display: 'inline-block',
  } as CSSProperties,
  continuar: {
    // The canonical primary, spread rather than restated: the CTA follows a change to the
    // button and no colour can be typed into this file (FR-027).
    ...PRIMARY_BUTTON_STYLE,
    display: 'inline-block',
    textDecoration: 'none',
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-5)',
  },
  painel: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  painelTitulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.06em',
  },
  opcoes: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
  },
  opcao: { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' },
  swatch: {
    display: 'inline-block',
    width: 'var(--space-5)',
    height: 'var(--space-5)',
    border: '2px solid var(--text-on-light)',
    borderRadius: 'var(--radius-sm)',
  },
  vazio: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' },
  nota: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    fontStyle: 'italic',
  },
}
