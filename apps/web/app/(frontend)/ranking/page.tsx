import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { CARD_TITLE_STYLE, EmptyState, PRIMARY_BUTTON_STYLE, PixelImage, cardStyle, formatHandle } from '@fablab/ui'

import { getTenantScopedPayloadForRSC } from '../../../lib/tenancy'
import { currentUser } from '../../../lib/tenancy/session'

/**
 * T043 / FR-013, FR-037, US6 — **`/ranking`**: this organization's makers, by XP total.
 *
 * CLR-007 puts the page here rather than in 006: *"005 computes the ranking, so the page reads
 * data that exists the moment it does — and the alternative is a footer link to a 404 for
 * however long 006 takes."* 006's Home card shows the top five and links here.
 *
 * ── The tie-break is DECLARED, and that is the whole of FR-013 ──────────────────────────────
 *
 * `sort: ['-xpTotal', 'handle']`. Sorting by XP alone is not "almost right": SQL makes no promise
 * about the order of rows a sort does not distinguish, so two makers tied at 12 XP come back in
 * whatever order the plan happened to produce — which changes with the plan, the page cache and
 * the rows' physical order. A ranking that reorders between two refreshes is wrong in the way
 * nobody can reproduce, and SC-013 (*"the ranking's tie-break is deterministic across runs"*)
 * is unprovable against it. `handle` is the second key because it is the one field every
 * profile has, is unique within a lab in practice, and is the name the row already shows — so
 * a reader can *see* why the order is what it is.
 *
 * ── Why the sort is the database's and not this file's ──────────────────────────────────────
 *
 * Sorting the page's own array would be a second definition of the ranking, free to drift from
 * the one the Home card's read uses. The order arrives ordered; this file renders what it is
 * given, top to bottom.
 *
 * ── Why it reads through the SIGNED-IN door (SC-018) ────────────────────────────────────────
 *
 * `perfilMaker` carries **no `publicList` declaration** in the scope registry — its entry
 * records only why it is scoped — so the anonymous client refuses to list it by construction,
 * and rightly: a lab's roster of makers and handles is not published content. SC-018 is written
 * about the answer this page gives *a signed-in maker*, and D6 says so: *"the `/ranking` read
 * crosses profiles within one organization, which is ordinary scoped reading"*. A signed-out
 * visitor is therefore invited in, the way `/missoes` invites them — not shown an empty board,
 * which would read as "this lab has no makers".
 *
 * Adding `publicList` here to make the page anonymous is not this task's to do: it is a change
 * to what the platform publishes about people, and it belongs to whoever argues for it.
 *
 * ── It displays; it never awards (FR-022) ───────────────────────────────────────────────────
 *
 * No write, by any door. The totals are `perfilMaker.xpTotal` — the projection the ledger
 * maintains inside the writing transaction (FR-010) — and FR-011's reconciliation gate is what
 * catches a drifted one. A page that recomputed from the ledger on view would be a second
 * economy, disagreeing with the one every other surface reads.
 */

export const metadata = { title: 'RANKING — Fab Lab CITe Bauru' }

/** This page's own path. Every link here — 006's Home card included — is built from this, so
 *  the route moves in one edit and no href is left pointing at the old one. */
export const RANKING_PATH = '/ranking'

const LOGIN_PATH = '/login'

/** The query parameter `/login` reads its destination from (`login/page.tsx`). */
const PARAM_DESTINO = 'de'

/** Where the invitation sends a signed-out visitor, and where login brings them back to. */
const CONVITE_HREF = `${LOGIN_PATH}?${PARAM_DESTINO}=${encodeURIComponent(RANKING_PATH)}`

/**
 * The declared order (FR-013). Named, because it is the requirement — a literal retyped at a
 * second call site is a second ranking free to disagree with this one.
 *
 * **An array, and the comma-joined string it replaced was not a multi-key sort at all.** Payload
 * splits on `,` only in `sanitizeSortParams`, which is wired into the REST layer; the local API
 * an RSC reaches calls `sanitizeSortQuery`, which does not split. `@payloadcms/drizzle`'s
 * `buildOrderBy` then wraps the whole string in an array, fails to resolve a column named
 * `xpTotal,handle`, swallows the failure in a bare `catch (_) { continue }`, and leaves the
 * `-createdAt` it pushes before the loop. The board listed the **newest profile first** — not
 * by XP, and with no tie-break — and FR-013 was met in no part.
 *
 * It passed its own test because the fake in `ranking-page.test.ts` split the comma. The witness
 * is now `tests/public/ranking-ordem.test.ts`, which asks a real Postgres, on a fixture built so
 * the `-createdAt` fallback returns the exact opposite of the right answer.
 */
export const ORDENACAO_DO_RANKING = ['-xpTotal', 'handle']

/** How many places the board draws. A guard against an unbounded read, not a paging strategy —
 *  and emphatically not Payload's default of 10, which would drop a lab's eleventh maker from
 *  the one screen they look for themselves on. */
const LIMITE_DO_RANKING = 100

/** One avatar frame in source pixels — the proportions `criar-conta` declares and `minha-conta`
 *  renders at. The render is composed from that frame, so measuring the scale against anything
 *  else would blur it. */
const LARGURA_DO_QUADRO = 32

/** The width a row would like for it. `PixelImage` clamps down to a whole multiple, so this is
 *  a request and never a stretch. */
const LARGURA_NA_LINHA = LARGURA_DO_QUADRO * 2

/** One populated `midiaImagem`, reduced to the only field a sprite needs. Structural rather
 *  than imported from `payload-types.ts`, which is gitignored: a page that imported a generated
 *  type would compile locally and fail CI (tasks.md § "Read before starting"). */
type MidiaDoc = { readonly url?: string | null }

/** One profile as the ranking read returns it at `depth: 1`. */
type PerfilDoc = {
  readonly id?: string | number
  readonly nome?: string
  readonly handle?: string
  readonly xpTotal?: number
  readonly avatarRender?: MidiaDoc | string | number | null
}

/**
 * This lab's makers, already ordered — or `null` when the read failed, which is a different
 * screen from "this lab has no makers", the same split every 003 listing makes.
 */
async function lerRanking(): Promise<PerfilDoc[] | null> {
  try {
    const db = await getTenantScopedPayloadForRSC()
    const { docs } = await db.find<PerfilDoc>({
      collection: 'perfilMaker',
      // No `where`: the tenant is the door's, and a second opinion here is a second place to
      // get it wrong (FR-028).
      sort: ORDENACAO_DO_RANKING,
      limit: LIMITE_DO_RANKING,
      // `avatarRender` is a relationship. At depth 0 it is an id, which is not art.
      depth: 1,
    })
    return docs
  } catch (erro) {
    console.warn('[ranking] a leitura dos perfis falhou; a página reporta em lugar.', erro)
    return null
  }
}

/** A populated render's URL. An unpopulated relationship is an id, and an id is not a picture. */
const urlDoAvatar = (avatar: PerfilDoc['avatarRender']): string | undefined =>
  typeof avatar === 'object' && avatar !== null && typeof avatar.url === 'string' ? avatar.url : undefined

/** The XP a profile carries. FR-043 leaves the total **uncapped**, so this is printed as it is
 *  stored; only `nivel` stops at the curve's ceiling. */
const xpDe = (perfil: PerfilDoc): number =>
  typeof perfil.xpTotal === 'number' && Number.isFinite(perfil.xpTotal) ? perfil.xpTotal : 0

/**
 * One place on the board: the position, the avatar, the name, the `@handle` and the XP total —
 * the four things US6 names, in the order it names them.
 *
 * A profile whose render has not been composed yet draws **no** `<img>` rather than an empty
 * frame: FR-007's rule about missing avatar art, applied to the page that lists everyone.
 */
function linha(perfil: PerfilDoc, posicao: number): ReactElement {
  const avatar = urlDoAvatar(perfil.avatarRender)
  const handle = formatHandle(perfil.handle ?? '')

  return (
    <li key={String(perfil.id ?? posicao)} style={ESTILO.linha}>
      <span style={ESTILO.posicao}>{`${posicao}º`}</span>
      {avatar !== undefined && (
        <PixelImage
          src={avatar}
          baseWidth={LARGURA_DO_QUADRO}
          targetWidth={LARGURA_NA_LINHA}
          alt={`Avatar de ${handle}`}
        />
      )}
      <span style={ESTILO.identidade}>
        <span style={CARD_TITLE_STYLE}>{perfil.nome}</span>
        <span style={ESTILO.handle}>{handle}</span>
      </span>
      <span style={ESTILO.xp}>{`${xpDe(perfil)} XP`}</span>
    </li>
  )
}

/** The board, the empty body or the error body — exactly one of the three. */
function resultado(perfis: PerfilDoc[] | null): ReactNode {
  if (perfis === null) {
    return (
      <EmptyState
        variant="erro"
        titulo="Não foi possível carregar o ranking."
        acao={{ label: 'Tentar novamente', href: RANKING_PATH }}
      />
    )
  }

  if (perfis.length === 0) {
    return (
      <EmptyState
        variant="vazio"
        titulo="Nenhum maker neste lab ainda."
        descricao="Assim que alguém ganhar o primeiro XP, o ranking aparece aqui."
        acao={{ label: 'Voltar ao início', href: '/' }}
      />
    )
  }

  // The order is the query's. Rendering by index is what makes the position a *place* on the
  // board rather than a number this file decided.
  return <ol style={ESTILO.lista}>{perfis.map((perfil, indice) => linha(perfil, indice + 1))}</ol>
}

/** The signed-out screen: the invitation, and no roster — see the docstring. */
function convite(): ReactElement {
  return (
    <section style={ESTILO.convite}>
      <p style={ESTILO.conviteTexto}>
        Entre na sua conta para ver o ranking de makers deste lab e a sua posição nele.
      </p>
      <a href={CONVITE_HREF} style={ESTILO.acao}>
        Entrar
      </a>
    </section>
  )
}

/**
 * `/ranking` — this lab's makers by XP, highest first, ties broken by handle.
 *
 * @example /ranking
 */
export default async function Page(): Promise<ReactElement> {
  const usuario = await currentUser()
  // Asked before the read and not after: a signed-out visitor is refused by `perfilMaker.read`
  // anyway, and reaching for the door only to catch its refusal would report an outage on a
  // screen whose real answer is "sign in".
  const perfis = usuario ? await lerRanking() : null

  return (
    <main style={ESTILO.pagina}>
      <section style={ESTILO.hero}>
        <h1 style={ESTILO.heroTitulo}>RANKING</h1>
        <p style={ESTILO.heroTexto}>
          Os makers deste lab por XP acumulado. Empates são desempatados pelo @handle, para que a
          ordem seja sempre a mesma.
        </p>
      </section>
      {usuario === null ? convite() : <section style={ESTILO.conteudo}>{resultado(perfis)}</section>}
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
  conteudo: { padding: 'var(--space-5)' },
  lista: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    margin: 0,
    padding: 0,
  },
  // The card surface the design system owns, never a second copy of its border and radius.
  linha: {
    ...cardStyle('claro'),
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },
  posicao: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-xl)',
    minWidth: 'var(--space-6)',
  },
  identidade: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 },
  handle: { fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-claro)' },
  xp: { fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' },
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
  acao: { ...PRIMARY_BUTTON_STYLE, display: 'inline-block', textDecoration: 'none' },
}
