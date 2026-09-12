import type { CSSProperties, ReactElement } from 'react'

import { redirect } from 'next/navigation'

import {
  DIRECOES_AVATAR,
  EmptyState,
  type DirecaoAvatar,
  type ItemAvatar,
  type SlotAvatar,
  type TomAvatar,
} from '@fablab/ui'

import {
  CATEGORIAS_AVATAR,
  LINHAS_AVATAR,
  type CategoriaAvatar,
} from '../../../../collections/avatar/AvatarItem'
import { TOTAL_TONS_DE_CABELO } from '../../../../collections/avatar/TomDeCabelo'
import { TOTAL_TONS_DE_PELE } from '../../../../collections/avatar/TomDePele'
import { getTenantScopedPayloadForRSC } from '../../../../lib/tenancy'
// Deep import, exactly as `criar-conta` and Minha Conta do it: the anonymous read path is not
// re-exported from `lib/tenancy`'s index, because it runs with `overrideAccess: true` and that
// unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../../lib/tenancy/public-payload'
import { currentUser } from '../../../../lib/tenancy/session'
import { CLASSE_DO_EDITOR, EditorDoAvatar } from './EditorDoAvatar'

/**
 * T035 / FR-023, FR-024, US6 — **editing the avatar after signup**, and `avatarRender` left
 * alone unless the configuration actually changed.
 *
 * ── FR-023 is about what the screen is loaded with ──────────────────────────────────────────
 *
 * *"The avatar is editable after signup through the same builder, loaded with the current
 * configuration."* The same builder, so this route reads the same three global catalogues step 1
 * reads and hands them to the same island component underneath; the current configuration, so
 * the profile's stored `avatarConfig` is serialised and handed down as the draft the builder
 * opens on. A screen that mounted the builder at its defaults would look entirely normal until
 * the first save, which would replace a finished avatar with the opening state of a form nobody
 * filled in.
 *
 * ── FR-024 is about what the save must NOT do ───────────────────────────────────────────────
 *
 * *"regenerated when the configuration changes"* — so a save that changed nothing must leave the
 * profile untouched. {@link avatarMudou} is that gate, and it compares **canonically** rather
 * than by string: the island rebuilds the draft from React state while the stored value comes
 * back in Postgres' `jsonb` key order, so two byte-different strings routinely describe the
 * identical avatar. A page comparing strings would rewrite the profile on every press and throw
 * away a render that still depicts this maker.
 *
 * ── What this page deliberately does not do, and why that is not a stub ─────────────────────
 *
 * It does not **compose** the PNG. There is no server-side compositor in the product and no way
 * to write one from here: uploads are browser-direct against a presigned URL
 * (`lib/uploads/presign.ts`, spike S1) and the choke-point client's `create` takes `data` and no
 * file, so a composed buffer has nowhere to go through a door this page is allowed. T035b owns
 * that asset path (FR-033), and what a changed configuration owes FR-024 **today** is the half
 * that can be got wrong here: the old render is cleared in the same write, so nothing serves a
 * PNG of an avatar that no longer exists. A stale render is the one state worse than none —
 * Minha Conta and every card compose from `avatarConfig` meanwhile (T034), so an absent PNG
 * costs nothing on screen while a wrong one is wrong everywhere at once.
 *
 * ── Why nothing the form sends decides whose avatar is written ──────────────────────────────
 *
 * `perfilMaker.update` is `scopedAccess()`, which is scoped to the **lab** and not to the row —
 * `PerfilMaker.ts` records that gap and names this feature as the one that first makes a profile
 * editable outside onboarding. So the profile is read from the session on every call, filtered
 * by the signed-in account, and nothing in the `FormData` is consulted except the configuration.
 */

export const metadata = { title: 'EDITAR AVATAR — Fab Lab CITe Bauru' }

/** This screen's own path — where a refused save returns, and what login is told to come back
 *  to. Exported so the route moves in one edit. */
export const AVATAR_PATH = '/minha-conta/avatar'

/** Minha Conta: where CANCELAR goes, where a saved avatar lands, and where a signed-in person
 *  with no profile in this lab belongs. */
export const CONTA_PATH = '/minha-conta'

const LOGIN_PATH = '/login'

/** The query parameter `/login` reads its destination from (`login/page.tsx`). */
const PARAM_DESTINO = 'de'

/**
 * The hidden field the configuration is posted in — **written by the island and read by the
 * action**, deliberately one constant: two spellings of one draft is a save that posts nothing
 * and reports success.
 */
export const CAMPO_AVATAR = 'avatar'

/**
 * The largest draft this action will look at.
 *
 * A configuration is nine ids, two palette ids, a base and a direction — a few hundred bytes.
 * The bound is generous by two orders of magnitude and still refuses the case it exists for: a
 * POST is reachable without the form, so the JSON parser must never be handed a megabyte by
 * somebody who simply typed one. Step 2 bounds the same draft for the same reason.
 */
export const LIMITE_RASCUNHO = 20_000

/** The query a refused save answers with, and the message the screen prints for it. */
const PARAM_ERRO = 'erro'
const ERRO_CONFIG = 'config'

export const MENSAGEM_CONFIG_INVALIDA =
  'Não foi possível ler o avatar enviado. Nada foi alterado — monte o avatar novamente e salve.'

/** One palette row — `tomDePele` and `tomDeCabelo` are the same three columns. Structural rather
 *  than imported from `payload-types.ts`, which is gitignored: a page that imported a generated
 *  type would compile locally and fail CI (tasks.md preamble item 6). */
type TomDoc = { readonly id?: string | number; readonly nome?: string; readonly hex?: string }

/** One cosmetic item, in the four columns the builder draws a picker from. */
type ItemDoc = {
  readonly id?: string | number
  readonly nome?: string
  readonly categoria?: string
  readonly camadaZ?: number
  /** `'f'` or `'m'` on `roupaCima` and absent everywhere else (FR-004). */
  readonly compativelBase?: string | null
}

/** The three reads, as one value the render walks. */
type Catalogo = {
  readonly peles: readonly TomDoc[]
  readonly cabelos: readonly TomDoc[]
  readonly itens: readonly ItemDoc[]
}

/** The profile this screen edits, in the two fields it needs: the row to write, and the avatar
 *  it currently holds. */
type PerfilDoEditor = { readonly id: string | number; readonly avatarConfig: unknown }

/** Why this request has no profile to edit — the two cases lead to different places. */
type SemPerfil = 'sem-sessao' | 'sem-perfil'

type Porta = Awaited<ReturnType<typeof getTenantScopedPayloadForRSC>>

/** The configuration as this action agrees to store it: the builder's shape, and nothing else. */
type ConfigSalva = {
  readonly base: 'f' | 'm'
  readonly pele?: string
  readonly cabeloTom?: string
  readonly itens: Readonly<Record<string, string>>
  readonly direcao: DirecaoAvatar
}

/** Every `avatarItem` row the catalogue holds — the limit the item read asks for. `LINHAS_AVATAR`
 *  and not `CATEGORIAS_AVATAR`: the first is rows *stored* and the second options *offered*, and
 *  they differ for `roupaCima`, whose ten pieces each exist as an `f` and an `m` sprite. */
const TOTAL_DE_ITENS = Object.values(LINHAS_AVATAR).reduce((soma, linhas) => soma + linhas, 0)

/**
 * The visitor-facing heading for each slot.
 *
 * The mockup's caps headings for the person building an avatar, not `AvatarItem.ts`'s admin
 * labels — two audiences, two vocabularies, exactly as step 1's shell records where it declares
 * the same nine. Keyed by {@link CategoriaAvatar}, so a tenth slot is a compile error here rather
 * than a panel that renders with no title.
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

/** The nine slots in their declared order — the order the builder stacks its pickers in, which
 *  `CATEGORIAS_AVATAR` records and no page may re-decide. */
const SLOTS = Object.keys(CATEGORIAS_AVATAR) as CategoriaAvatar[]

const SLOTS_DO_BUILDER: readonly SlotAvatar[] = SLOTS.map((slot) => ({
  slot,
  titulo: TITULO_DO_SLOT[slot],
}))

/** One avatar frame in source pixels, and the width this screen would like — the proportions the
 *  art is authored at, at a whole multiple of the frame so the pixel grid stays crisp. */
const LARGURA_DO_QUADRO = 32
const ALTURA_DO_QUADRO = 48
const LARGURA_DO_PREVIEW = LARGURA_DO_QUADRO * 6

const ehDirecao = (valor: unknown): valor is DirecaoAvatar =>
  typeof valor === 'string' && (DIRECOES_AVATAR as readonly string[]).includes(valor)

/** Slot → chosen id, keeping only the pairs that name a **known** slot with a string id. The
 *  submission is the sender's to write, so an invented slot is dropped here rather than stored
 *  and puzzled over by every later reader. */
function itensSubmetidos(cru: unknown): Record<string, string> {
  if (cru === null || typeof cru !== 'object') return {}
  const conhecidos = new Set<string>(SLOTS)
  const pares = Object.entries(cru as Record<string, unknown>).filter(
    (par): par is [string, string] => conhecidos.has(par[0]) && typeof par[1] === 'string',
  )
  return Object.fromEntries(pares)
}

/**
 * The submitted draft as a configuration this action is willing to store — or `null`, which is
 * *"nothing here is an avatar"*.
 *
 * `PerfilMaker.ts` says where this belongs: *"The value arrives from a client, so the signup and
 * avatar-edit actions validate it where it crosses the boundary — this column is storage, not
 * the gate."* This is that gate, and it refuses rather than repairs on the two fields where a
 * silent default would be a lie about the person: an unreadable `base` or `direcao` would flip a
 * maker's avatar to `f`/`frente` on a submission nobody could read.
 *
 * @example configSubmetida('{"base":"m","itens":{},"direcao":"frente"}') // a stored configuration
 * @example configSubmetida('não é json') // null
 */
export function configSubmetida(cru: string): ConfigSalva | null {
  if (cru.length === 0 || cru.length > LIMITE_RASCUNHO) return null
  let bruto: unknown
  try {
    bruto = JSON.parse(cru)
  } catch {
    return null
  }
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const draft = bruto as Record<string, unknown>
  if (draft.base !== 'f' && draft.base !== 'm') return null
  if (!ehDirecao(draft.direcao)) return null
  return {
    base: draft.base,
    ...(typeof draft.pele === 'string' ? { pele: draft.pele } : {}),
    ...(typeof draft.cabeloTom === 'string' ? { cabeloTom: draft.cabeloTom } : {}),
    itens: itensSubmetidos(draft.itens),
    direcao: draft.direcao,
  }
}

/** The same value with every object's keys in one order, so two spellings of one avatar compare
 *  equal. Arrays keep their order, which is meaning rather than spelling. */
function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado)
  if (valor === null || typeof valor !== 'object') return valor ?? null
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, conteudo]) => conteudo !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return Object.fromEntries(entradas.map(([chave, conteudo]) => [chave, ordenado(conteudo)]))
}

/**
 * Did the avatar actually change? — the whole of FR-024's *"when the configuration changes"*.
 *
 * Canonical, not textual. The island serialises from React state and the stored value comes back
 * in the database's own key order, so `JSON.stringify(a) !== JSON.stringify(b)` is true for
 * avatars that are identical — and a page believing it would rewrite the profile on every press,
 * discarding a render that still depicts this maker and, once a compositor exists, paying to
 * compose a new one for nothing.
 *
 * @example avatarMudou({ base: 'f', itens: {} }, { itens: {}, base: 'f' }) // false
 */
export function avatarMudou(anterior: unknown, proximo: unknown): boolean {
  return JSON.stringify(ordenado(anterior)) !== JSON.stringify(ordenado(proximo))
}

/**
 * This request's own profile in this lab, read from the session on every call.
 *
 * The lookup is filtered by the signed-in account. Scoped to the organization alone it would
 * return whichever profile came first, and this screen would edit a stranger's avatar — which
 * `perfilMaker.update` would allow, being scoped to the lab rather than the row.
 */
async function editorDoVisitante(): Promise<{ db: Porta; perfil: PerfilDoEditor } | SemPerfil> {
  const usuario = await currentUser()
  if (!usuario) return 'sem-sessao'

  const db = await getTenantScopedPayloadForRSC()
  const { docs } = await db.find<{ id: string | number; avatarConfig?: unknown }>({
    collection: 'perfilMaker',
    where: { usuario: { equals: usuario.id } },
    limit: 1,
    depth: 0,
  })

  const perfil = docs[0]
  // One login may hold profiles in two labs (002 § CLR-002). No profile *here* means there is no
  // avatar for this lab's screen to edit, and reaching for another lab's is never the answer.
  if (!perfil) return 'sem-perfil'
  return { db, perfil: { id: perfil.id, avatarConfig: perfil.avatarConfig } }
}

/** Signed out, login with the way back; signed in with no profile here, Minha Conta — which
 *  renders that state as a screen rather than bouncing again, so this cannot loop. */
const destinoSemPerfil = (motivo: SemPerfil): string =>
  motivo === 'sem-sessao' ? `${LOGIN_PATH}?${PARAM_DESTINO}=${encodeURIComponent(AVATAR_PATH)}` : CONTA_PATH

/**
 * Save the edited avatar (FR-023), and regenerate the render **only** if it changed (FR-024).
 *
 * Order, and why it is this one: the session is checked, the profile is read from it, the draft
 * is validated, and only then is anything compared or written. Nothing is caught — a failed
 * update must reach the caller so the request's transaction rolls back, and reporting success
 * over a write that did not happen is the one report a person cannot check.
 *
 * The unchanged case returns **without any write at all**, which is the requirement: a rewrite
 * that stores the same configuration would still drop `avatarRender`, so "we wrote the same
 * values" and "we changed nothing" are opposite behaviours behind one screen.
 */
export async function salvarAvatar(dados: FormData): Promise<void> {
  'use server'

  const sessao = await editorDoVisitante()
  if (typeof sessao === 'string') redirect(destinoSemPerfil(sessao))

  const proximo = configSubmetida(String(dados.get(CAMPO_AVATAR) ?? ''))
  if (proximo === null) redirect(`${AVATAR_PATH}?${PARAM_ERRO}=${ERRO_CONFIG}`)

  if (!avatarMudou(sessao.perfil.avatarConfig, proximo)) redirect(CONTA_PATH)

  await sessao.db.update({
    collection: 'perfilMaker',
    // From the session, never from the form: every field of a `FormData` is the sender's to
    // write, and a form-chosen id would edit any maker of this lab.
    id: sessao.perfil.id,
    data: {
      avatarConfig: proximo,
      // Cleared in the SAME write as the configuration it belongs to (FR-024). The stored PNG
      // depicts the avatar that has just been replaced; leaving it would keep every card and
      // ranking row drawing the old one. Composing the replacement is the asset path T035b
      // owns — until then Minha Conta and the cards compose from `avatarConfig` (T034).
      avatarRender: null,
    },
  })

  redirect(CONTA_PATH)
}

/**
 * The whole catalogue, through the anonymous choke point.
 *
 * `avatarItem`, `tomDePele` and `tomDeCabelo` are **global** (CLR-001) and their collection
 * `read` is `masterOnly()`, so the signed-in maker's own client is refused there by construction.
 * `getPublicScopedPayloadForRSC` is the sanctioned door for exactly those three catalogues, and
 * step 1 of signup already reads them through it.
 *
 * **Each limit is the catalogue's own size**, taken from the constant that defines it: Payload's
 * default is 10, and under it the person editing their avatar would be offered half the skin
 * tones and a tenth of the items with nothing on the page saying so.
 */
async function lerCatalogo(): Promise<Catalogo> {
  const db = await getPublicScopedPayloadForRSC()
  const [peles, cabelos, itens] = await Promise.all([
    db.find<TomDoc>({ collection: 'tomDePele', depth: 0, limit: TOTAL_TONS_DE_PELE, sort: 'ordem' }),
    db.find<TomDoc>({
      collection: 'tomDeCabelo',
      depth: 0,
      limit: TOTAL_TONS_DE_CABELO,
      sort: 'ordem',
    }),
    db.find<ItemDoc>({ collection: 'avatarItem', depth: 0, limit: TOTAL_DE_ITENS, sort: 'nome' }),
  ])
  return { peles: peles.docs, cabelos: cabelos.docs, itens: itens.docs }
}

/** `null` is *"the catalogue could not be read"*, which is a different screen from *"there is
 *  nothing in it"* — the same split every 003 listing makes. */
async function lerOuFalhar<T>(leitura: () => Promise<T>): Promise<T | null> {
  try {
    return await leitura()
  } catch (erro) {
    console.warn('[minha-conta/avatar] a read failed; the screen reports it in place.', erro)
    return null
  }
}

/**
 * The catalogue rows as the builder's own shapes.
 *
 * Two vocabularies meet here: `avatarItem` calls the slot `categoria` and the base column
 * `compativelBase`, while `@fablab/ui` — which FR-018 forbids from importing anything in this app
 * — calls them `slot` and `base`. `String(id)`: Payload ids are numbers on Postgres and a
 * configuration stores strings, and a `23` that never equals `'23'` is a chosen item that draws
 * as unchosen for ever.
 */
function itensDoBuilder(itens: readonly ItemDoc[]): ItemAvatar[] {
  return itens.map((item) => ({
    id: String(item.id ?? ''),
    nome: item.nome ?? '',
    slot: item.categoria ?? '',
    camadaZ: item.camadaZ ?? 0,
    base: item.compativelBase === 'f' || item.compativelBase === 'm' ? item.compativelBase : undefined,
  }))
}

/** One palette row, likewise. `hex` is **data, not a token** (CLR-005) — a skin tone is the one
 *  colour nobody themes, because repainting it would change a person's depiction of themselves. */
function tonsDoBuilder(tons: readonly TomDoc[]): TomAvatar[] {
  return tons.map((tom) => ({ id: String(tom.id ?? ''), nome: tom.nome ?? '', hex: tom.hex ?? '' }))
}

/** CANCELAR — the way off this screen that changes nothing. Rendered here and handed to the
 *  island, so the copy and the destination have one definition across both paths: the built
 *  screen, and the one where the catalogue read failed and the island never mounts. */
function cancelar(): ReactElement {
  return (
    <a href={CONTA_PATH} style={ESTILO.cancelar}>
      CANCELAR
    </a>
  )
}

function cabecalho(): ReactElement {
  return (
    <header style={ESTILO.cabecalho}>
      <h1 style={ESTILO.titulo}>EDITAR AVATAR</h1>
      <p style={ESTILO.subtitulo}>
        Mude o que quiser e salve. Seu avatar aparece no seu perfil e nos seus conteúdos.
      </p>
    </header>
  )
}

/** The read failed: report it in place with a retry, and CANCELAR still on screen — the island
 *  that normally carries it never mounts here, and a person who meets an outage must have
 *  something to press other than the browser's back button. */
function falhaDeLeitura(titulo: string): ReactElement {
  return (
    <main style={ESTILO.pagina_}>
      {cabecalho()}
      <div style={ESTILO.falha}>
        <EmptyState
          surface="light"
          variant="erro"
          titulo={titulo}
          descricao="Recarregue a página para tentar de novo."
          acao={{ label: 'Tentar novamente', href: AVATAR_PATH }}
        />
        {cancelar()}
      </div>
    </main>
  )
}

/** The builder, mounted over the catalogue this page read and the avatar it already has. */
function editor(catalogo: Catalogo, perfil: PerfilDoEditor): ReactElement {
  return (
    <EditorDoAvatar
      slots={SLOTS_DO_BUILDER}
      itens={itensDoBuilder(catalogo.itens)}
      peles={tonsDoBuilder(catalogo.peles)}
      cabelos={tonsDoBuilder(catalogo.cabelos)}
      larguraBase={LARGURA_DO_QUADRO}
      alturaBase={ALTURA_DO_QUADRO}
      larguraAlvo={LARGURA_DO_PREVIEW}
      alt="Seu avatar, como está sendo editado"
      // FR-023: the builder opens on what the person already has, never on the defaults. The
      // configuration travels as the same bounded string step 1's draft travels as, so there is
      // one reading of it (`configDoRascunho`) rather than one per screen.
      rascunho={perfil.avatarConfig === undefined || perfil.avatarConfig === null
        ? null
        : JSON.stringify(perfil.avatarConfig)}
      campo={CAMPO_AVATAR}
      acao={salvarAvatar}
      cancelar={cancelar()}
    />
  )
}

type EditarAvatarPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/minha-conta/avatar` — the avatar, editable (FR-023).
 *
 * @example /minha-conta/avatar  (signed out, it becomes /login?de=%2Fminha-conta%2Favatar)
 */
export default async function Page({ searchParams }: EditarAvatarPageProps = {}): Promise<ReactElement> {
  // Outside the read guard on purpose: `redirect` works by throwing, so a `try` around this would
  // catch the redirect and render an error screen instead of leaving.
  const sessao = await lerOuFalhar(editorDoVisitante)
  if (sessao === null) return falhaDeLeitura('Não foi possível carregar seu perfil.')
  if (typeof sessao === 'string') redirect(destinoSemPerfil(sessao))

  const catalogo = await lerOuFalhar(lerCatalogo)
  if (catalogo === null) return falhaDeLeitura('Não foi possível carregar o catálogo do avatar.')

  const query = (await searchParams) ?? {}
  const recusado = query[PARAM_ERRO] === ERRO_CONFIG

  return (
    <main style={ESTILO.pagina_}>
      {cabecalho()}
      {recusado ? (
        <p role="alert" style={ESTILO.erro}>
          {MENSAGEM_CONFIG_INVALIDA}
        </p>
      ) : null}
      {editor(catalogo, sessao.perfil)}
      <style href="fablab-editar-avatar" precedence="default">
        {EDITAR_AVATAR_CSS}
      </style>
    </main>
  )
}

/** Only what a style object cannot express — React has no media query. The rail sits above the
 *  panels on a narrow screen and beside them from the tablet breakpoint up, which is the same
 *  two-column arrangement step 1 lays its builder out in. The class comes from
 *  {@link CLASSE_DO_EDITOR} rather than a literal, so the markup and this stylesheet cannot
 *  drift. */
const EDITAR_AVATAR_CSS = `
@media (min-width: 834px) {
  .${CLASSE_DO_EDITOR} > :first-child { grid-template-columns: minmax(240px, 1fr) 3fr; }
}
`

/**
 * Every style this page declares, in one object — style objects rather than a stylesheet, for
 * the reason every page here records: the suite runs at `node` with no DOM, so a class name
 * would be assertable only as text in two files. Every colour is a token (FR-034).
 */
const ESTILO: Record<string, CSSProperties> = {
  // Trailing underscore, as the sibling pages write it: `pagina` also names a query parameter in
  // this codebase, and two meanings for one word is how the wrong one gets used.
  pagina_: {
    // A light page, as the rest of the account flow is. The surface ROLES are re-declared rather
    // than a colour painted, so every component inside follows the region into the light
    // treatment.
    '--surface-page': 'var(--surface-inverted)',
    '--surface-card': 'var(--surface-inverted)',
    // The `:root` default ring is the accent, which scores ~2:1 on this white page — invisible on
    // exactly the controls a keyboard visitor is aiming for. Navy is the ink the page writes in.
    '--focus-ring-color': 'var(--text-on-light)',
    background: 'var(--surface-page)',
    color: 'var(--text-on-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
    padding: 'var(--space-8) var(--space-5) var(--space-10)',
  } as CSSProperties,
  cabecalho: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  titulo: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-3xl)',
    textTransform: 'uppercase',
  },
  subtitulo: { margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' },
  // The refusal notice, treated exactly as the deletion screen treats its own: navy ink in a
  // navy outline on the light surface. There is no error token in the palette, and inventing a
  // red here would be the first hex in a component (FR-034).
  erro: {
    margin: 0,
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-on-light)',
    background: 'var(--surface-inverted)',
    border: '2px solid var(--color-navy)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
  },
  /** The failure path's own stack: the empty state, then the way out under it. */
  falha: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-5)' },
  cancelar: {
    // The secondary of `onboarding.md` § *Trilho esquerdo*: navy fill, light text. It is not
    // `Button` — that component is the canonical primary and has no variant, because the
    // secondary is still `(proposta)` in the identity document.
    background: 'var(--color-navy)',
    color: 'var(--color-claro)',
    '--focus-ring-color': 'var(--color-claro)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-6)',
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-base)',
    textDecoration: 'none',
    // `inline-flex` + `minHeight`, not `inline-block`: left to its padding and line height this
    // came to 43.2px, which is the measurement FR-032b's gate exists to refuse. The signup
    // routes were given the same treatment in T035c and this mount was left out of the list, so
    // the defect survived where nothing was looking (`breakpoints-focus.test.ts` § CADASTRO).
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
  } as CSSProperties,
}
