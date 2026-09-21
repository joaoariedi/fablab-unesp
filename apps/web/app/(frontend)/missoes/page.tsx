import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { CARD_TITLE_STYLE, EmptyState, PRIMARY_BUTTON_STYLE, ProgressBar, cardStyle } from '@fablab/ui'

import {
  ETAPAS_DA_MISSAO,
  ETAPAS_POR_ESTADO,
  estadoDe,
  type EstadoPessoal,
  type StatusSubmissao,
  type SubmissaoDoc,
} from '../../../lib/content/missoes'
import { estadoPessoal } from '../../../lib/public/missoes'
// Deep import, exactly as every listing and Minha Conta do it: the anonymous read path is not
// re-exported from `lib/tenancy`'s index, because it runs with `overrideAccess: true` and that
// unexported-ness is one of the two locks the module keeps.
import { getPublicScopedPayloadForRSC } from '../../../lib/tenancy/public-payload'

/**
 * T032 / FR-024, US3 — **Missões**: the lab's published missions, and the visitor's own state
 * on each one.
 *
 * FR-024 is two sentences and this file is built around both: *"A mission's progress shown to a
 * maker is **their own**; a signed-out visitor sees the mission with **no personal percentage**
 * and an invitation to sign in."*
 *
 * ── Two reads, two doors, and why the mission list uses the anonymous one ───────────────────
 *
 * The catalogue is the same for everybody — `Missao.ts` says so where it explains its `status`
 * field: *"The signed-out visitor of FR-024 never reaches this function at all; they are served
 * by `getPublicScopedPayload`"*. So the missions are read through the anonymous door for every
 * visitor, signed in or not: it is host-fixed, it filters `status: publicado` itself, and using
 * one path for both means the mission a maker discusses with a signed-out friend is literally
 * the same row. What differs between the two screens is only what is layered **on top** of it.
 *
 * The personal layer — the profile and this maker's own submissions — goes through
 * `getTenantScopedPayloadForRSC`, which is the door FR-028 is about, and it is only opened when
 * there is a session to open it for.
 *
 * ── T018 / FR-007: the model and the personal read are IMPORTED, not owned here ─────────────
 *
 * They were both written in this file, and until 006 this was their only reader. The Home's
 * `MISSÕES EM DESTAQUE` band is the second, and FR-007 is explicit that *"the arithmetic is
 * expressed once and shared with `/missoes`, never restated"* — two pages importing each other's
 * page module is not an option, so both halves moved out and this page became one of two callers:
 *
 *   - `lib/content/missoes.ts` — {@link ETAPAS_DA_MISSAO}, {@link ETAPAS_POR_ESTADO},
 *     {@link estadoDe} and the types. Pure, so it is unit-tested with no database at all.
 *   - `lib/public/missoes.ts` — {@link estadoPessoal}, which opens the tenant-scoped door and
 *     constrains the submissions read to the **session-resolved** profile. That constraint is
 *     the whole of "their own" and its docstring is where it is argued: `missaoSubmissao.read`
 *     is `scopedAccess()`, scoped to the lab and not to the row, so a reader that fetched the
 *     lab's submissions would be *allowed* to and would be one forgotten clause away from
 *     drawing a lab-mate's 100% on this visitor's card.
 *
 * What stayed is this page's own rendering: the hero, the grid, the card, the invitation, the
 * submit control and the words each review state gets. `§7` of `missoes-page.test.ts` is what
 * keeps the split honest — it replaces the shared model with a three-of-four scale and reads the
 * rendered percentage back, so re-introducing a local `2` here fails on a number no literal in
 * this file can produce.
 *
 * ── Why the percentage is two steps and not a mockup number ─────────────────────────────────
 *
 * `home.md` § MISSÕES EM DESTAQUE draws `50%` / `30%` / `0%` and says of those numbers nothing
 * at all — they are art. What the data models is a review: a maker sends the proof, the team
 * validates it (FR-021). That is two steps, so {@link ETAPAS_DA_MISSAO} is 2 and a submission
 * awaiting review is one of them — 50%, arrived at from the model rather than copied from a
 * picture. `ProgressBar` takes value/max in the caller's units precisely so this arithmetic
 * lives in one module and the rounding stays in the component.
 *
 * `home.md` also says the signed-out card shows *"a barra … em 0% com convite ao login"*. FR-024
 * says **no personal percentage**, and it wins: a bar reading 0% is a claim about a person the
 * page has not identified, and it is indistinguishable from a maker who has not started. The
 * divergence is recorded here rather than resolved silently.
 *
 * ── The submit control, and the door it can actually use ────────────────────────────────────
 *
 * FR-036 makes `comprovante` a **required** `midiaImagem` relationship, and there is no
 * front-end path that can produce one: uploads are browser-direct against a presigned URL
 * (`lib/uploads/presign.ts`) whose endpoint does not exist yet (`lib/uploads/limits.ts` records
 * that), and the choke point's `CreateArgs` is `{ collection, data, depth }` — **no `file`** —
 * so a server action here could not create the media either. Widening that type is a change to
 * the anonymous/authenticated write surface and belongs to the task that ships the upload flow,
 * not to this page.
 *
 * So the control is a link to the door that exists today, which is exactly the trade Minha
 * Conta already records for its `+ Criar` actions: *"an empty state whose action 404s is worse
 * than one with none. The admin form is the door that actually exists today; the day the flow
 * ships, this is the one line that changes."* Here that line is {@link SUBMISSAO_BASE}.
 *
 * ── NOTHING IN THE PRODUCT LINKS HERE YET, and that is a reported gap ───────────────────────
 *
 * Measured, not assumed: `grep -rn missoes apps/web/app apps/web/lib packages/ui/src` finds this
 * file and nothing else. `/missoes` is therefore reachable only by typing the URL — the fifth
 * failure of feature 004 (`/minha-conta/avatar` shipped with nothing pointing at it) and the one
 * tasks.md § "Read before starting" item 1 is written about: *"a page test walks the tree ITS OWN
 * page returns, so an unreferenced route leaves no trace in anybody's"*. This suite cannot see
 * it either, which is why it is written down here.
 *
 * The two places that would close it are **not this task's files**: the shell's tab data
 * (`packages/ui/src/shell/tabs.ts`, whose six destinations are the designer's canonical set —
 * `concept.md`, 2026-08-23) and the Home's `MISSÕES EM DESTAQUE` band with its `VER TODAS ›`
 * link, which Home v1 deliberately does not render (CLR-004) and which the surfaces phase owns.
 * Adding a seventh tab here would be this page deciding the site's navigation on its own.
 *
 * A **rejected** submission links to its own row rather than to the create form: FR-023 puts a
 * unique index on `(missao, maker)`, so a second create is refused by the database, and CLR-015
 * reopens the row by having the maker edit it (`reabrirRecusada`). A "submit again" button
 * pointing at `create` would be a control whose only possible outcome is an error.
 */

export const metadata = { title: 'MISSÕES — Fab Lab CITe Bauru' }

/** This page's own path. Every link back to it is built from this, so the route moves in one
 *  edit and no href is left pointing at the old one. */
export const MISSOES_PATH = '/missoes'

const LOGIN_PATH = '/login'

/** The query parameter `/login` reads its destination from (`login/page.tsx`). */
const PARAM_DESTINO = 'de'

/** Where the invitation of FR-024 sends a signed-out visitor, and where login brings them back
 *  to. Without the destination they sign in and land somewhere that is not the mission they
 *  were reading. */
const CONVITE_HREF = `${LOGIN_PATH}?${PARAM_DESTINO}=${encodeURIComponent(MISSOES_PATH)}`

/**
 * The admin's own form for a submission — see the docstring for why this is the door.
 *
 * `/admin/collections/<slug>/create` is the same shape Minha Conta's `criarHref` uses, and the
 * slug is `missaoSubmissao` rather than a retyped string in each href below.
 */
const SUBMISSAO_BASE = '/admin/collections/missaoSubmissao'

/** How many missions the page draws. A lab curates a handful, so this is a guard against an
 *  unbounded read rather than a paging strategy — Payload's own default is 10, which would
 *  silently hide the eleventh mission a team published. */
const MISSOES_LIMITE = 50

/** What each state says in words. A bar alone does not tell a maker whether the team has looked
 *  at their photo yet, which is the only question they have on this screen. */
const MENSAGEM_POR_ESTADO = {
  enviada: 'Comprovante enviado — aguardando a validação da equipe.',
  aprovada: 'Missão concluída — 1 XP creditado.',
  recusada: 'Comprovante recusado — envie um novo para reabrir a submissão.',
} satisfies Record<StatusSubmissao, string>

const SEM_SUBMISSAO = 'Você ainda não enviou o comprovante desta missão.'

/** One media document as `depth: 1` populates it. Structural rather than imported from
 *  `payload-types.ts`, which is gitignored: a page that imported a generated type would compile
 *  locally and fail CI (tasks.md § "Read before starting", item 8). */
type MidiaDoc = { readonly url?: string | null }

/** One `skill` row as `missao.skill` populates it at `depth: 1`. */
type SkillDoc = { readonly nome?: string }

/** One published mission, populated one level. */
type MissaoDoc = {
  readonly id?: string | number
  readonly titulo?: string
  readonly descricao?: string
  readonly icone?: MidiaDoc | number | string | null
  readonly skill?: SkillDoc | number | string | null
}

/** The published catalogue, or `null` when the read failed — which is a different screen from
 *  "there are no missions yet", the same split every 003 listing makes. */
async function lerMissoes(): Promise<MissaoDoc[] | null> {
  try {
    const db = await getPublicScopedPayloadForRSC()
    const { docs } = await db.find<MissaoDoc>({
      collection: 'missao',
      // `icone` and `skill` are relationships; at depth 0 the first is an id with no art and
      // the second is an id with no name.
      depth: 1,
      limit: MISSOES_LIMITE,
      sort: 'titulo',
    })
    return docs
  } catch (erro) {
    console.warn('[missoes] a leitura do catálogo falhou; a página reporta em lugar.', erro)
    return null
  }
}

/** A populated relationship's URL. An unpopulated one is an id, which is not art. */
const urlDe = (midia: MissaoDoc['icone']): string | undefined =>
  typeof midia === 'object' && midia !== null && typeof midia.url === 'string' ? midia.url : undefined

/** The skill a mission credits, when it arrived populated. */
const nomeDaSkill = (skill: MissaoDoc['skill']): string | undefined =>
  typeof skill === 'object' && skill !== null && typeof skill.nome === 'string' ? skill.nome : undefined

/** The maker's action for this mission, or none where the review owns the next move. */
function acaoDe(submissao: SubmissaoDoc | undefined, estado: StatusSubmissao | undefined): ReactNode {
  if (estado === undefined) {
    return (
      <a href={`${SUBMISSAO_BASE}/create`} style={ESTILO.acao}>
        Enviar comprovante
      </a>
    )
  }
  // CLR-015: the row is REOPENED by the maker's edit, never replaced — a second create is
  // refused by the `(missao, maker)` unique index (FR-023).
  if (estado === 'recusada') {
    return (
      <a href={`${SUBMISSAO_BASE}/${String(submissao?.id ?? '')}`} style={ESTILO.acao}>
        Enviar novo comprovante
      </a>
    )
  }
  return null
}

/** The personal block: the bar, the sentence and the action — all three only for a maker of
 *  this lab, because all three are statements about a particular person (FR-024). */
function progressoDe(missao: MissaoDoc, estadoDaPagina: EstadoPessoal): ReactNode {
  if (estadoDaPagina.tipo !== 'maker') return null

  const submissao = estadoDaPagina.submissoes.get(String(missao.id))
  const estado = estadoDe(submissao)
  const etapas = estado === undefined ? 0 : ETAPAS_POR_ESTADO[estado]

  return (
    <>
      <ProgressBar value={etapas} max={ETAPAS_DA_MISSAO} label={`Missão: ${missao.titulo ?? ''}`} />
      <p style={ESTILO.estado}>{estado === undefined ? SEM_SUBMISSAO : MENSAGEM_POR_ESTADO[estado]}</p>
      {acaoDe(submissao, estado)}
    </>
  )
}

/** One mission card: the icon, the title, the description, the skill it credits — and, for a
 *  maker, their own state on it. */
function cartao(missao: MissaoDoc, estadoDaPagina: EstadoPessoal): ReactElement {
  const icone = urlDe(missao.icone)
  const skill = nomeDaSkill(missao.skill)

  return (
    <article key={String(missao.id)} style={ESTILO.cartao}>
      {icone !== undefined && <img src={icone} alt="" width={48} height={48} style={ESTILO.icone} />}
      <h2 style={CARD_TITLE_STYLE}>{missao.titulo}</h2>
      <p style={ESTILO.descricao}>{missao.descricao}</p>
      {skill !== undefined && <p style={ESTILO.skill}>{`Concede 1 XP em ${skill}.`}</p>}
      {progressoDe(missao, estadoDaPagina)}
    </article>
  )
}

/**
 * FR-024's invitation, once on the page rather than once per card.
 *
 * It replaces the personal block instead of sitting beside an empty one: a visitor with no
 * session has nothing to be at 0% of.
 */
function convite(): ReactElement {
  return (
    <section style={ESTILO.convite}>
      <p style={ESTILO.conviteTexto}>
        Entre na sua conta para enviar comprovantes e acompanhar o seu progresso em cada missão.
      </p>
      <a href={CONVITE_HREF} style={ESTILO.acao}>
        Entrar
      </a>
    </section>
  )
}

/** The grid, the empty body or the error body — exactly one of the three. */
function resultado(missoes: MissaoDoc[] | null, estadoDaPagina: EstadoPessoal): ReactNode {
  if (missoes === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar as missões."
        acao={{ label: 'Tentar novamente', href: MISSOES_PATH }}
      />
    )
  }

  if (missoes.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhuma missão publicada."
        descricao="Assim que a equipe publicar uma missão, ela aparece aqui."
        acao={{ label: 'Voltar ao início', href: '/' }}
      />
    )
  }

  return <div style={ESTILO.grade}>{missoes.map((missao) => cartao(missao, estadoDaPagina))}</div>
}

/**
 * `/missoes` — the lab's published missions, and the reader's own state on each.
 *
 * @example /missoes
 */
export default async function Page(): Promise<ReactElement> {
  const missoes = await lerMissoes()
  // The personal layer is asked for the missions actually on screen, so a failed catalogue read
  // never turns into a second failed read for rows nobody is going to see.
  const estadoDaPagina = await estadoPessoal(missoes ?? [])

  return (
    <main style={ESTILO.pagina}>
      <section style={ESTILO.hero}>
        <h1 style={ESTILO.heroTitulo}>MISSÕES</h1>
        <p style={ESTILO.heroTexto}>
          Desafios publicados pela equipe do lab. Complete, envie o comprovante e ganhe XP na skill da
          missão.
        </p>
      </section>
      {estadoDaPagina.tipo === 'anonimo' && convite()}
      <section style={ESTILO.conteudo}>{resultado(missoes, estadoDaPagina)}</section>
    </main>
  )
}

/**
 * The page's styles.
 *
 * Tokens only, never a literal colour: the colour fence (feature 001) rejects a hex in app code,
 * and `--surface-band` with `--text-on-light` is the documented navy-on-teal pair every hero
 * band on the site already uses.
 */
const ESTILO: Record<string, CSSProperties> = {
  pagina: { paddingBottom: 'var(--space-7)' },
  hero: {
    background: 'var(--surface-band)',
    color: 'var(--text-on-light)',
    padding: 'var(--space-6) var(--space-5)',
  },
  heroTitulo: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', margin: 0 },
  heroTexto: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', maxWidth: '48ch' },
  convite: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-5)',
  },
  conviteTexto: {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-claro)',
    margin: 0,
  },
  conteudo: { padding: 'var(--space-5)' },
  grade: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))',
    gap: 'var(--space-5)',
  },
  // The card surface the design system owns, never a second copy of its border and radius.
  cartao: cardStyle('primary'),
  icone: { width: 'var(--space-8)', height: 'var(--space-8)' },
  descricao: { margin: 0 },
  skill: { margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-claro)' },
  estado: { margin: 0, fontSize: 'var(--text-sm)' },
  acao: { ...PRIMARY_BUTTON_STYLE, display: 'inline-block', textDecoration: 'none' },
}
