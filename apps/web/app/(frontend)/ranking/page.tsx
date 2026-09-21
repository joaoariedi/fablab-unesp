import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { CARD_TITLE_STYLE, EmptyState, PixelImage, cardStyle, formatHandle } from '@fablab/ui'

import { type RankingRow, readPublicRanking } from '../../../lib/tenancy/public-payload'

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
 * ── T012 / FR-017: the board is PUBLIC, and the read is a projected one ─────────────────────
 *
 * It read through the signed-in choke point and showed a visitor with no session an invitation
 * to log in. That was correct while `perfilMaker` carried no public declaration — but 006 puts
 * this lab's top five on the Home, where the same visitor reads it without an account, and a
 * page that then refuses them the full board publishes a link to a wall.
 *
 * So the read is `readPublicRanking` (`lib/tenancy/public-payload.ts`), the fifth named
 * exemption in `lib/tenancy` and the one that reads a table holding consented personal data.
 * **The bound is the `select` it passes, not the type it returns**: `dataNascimento`,
 * `escolaridade`, `curso`, `vinculoUnesp` and `usuario` are never fetched at all, rather than
 * fetched into an elevated anonymous context and dropped by convention. The reasoning lives
 * beside that function, where the anonymous surface is reviewed; this page is one of its two
 * callers and states no scope of its own.
 *
 * There is therefore **no session branch left here**. A page that asked who is reading would be
 * asking a question whose answer changes nothing on the screen — and the Home card, reading the
 * same function, would disagree with it for exactly the visitors 006 is about.
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
// `RANKING_PATH` and `ORDENACAO_DO_RANKING` moved to `lib/content/ranking.ts` in feature 006.
// Two surfaces needed them — the Home's footer link and `readPublicRanking`'s order — and a
// LIBRARY importing a route module inverts the dependency the tenancy layer is built on. Re-
// exported here so this page stays the place a reader looks for what the board is.
import { ORDENACAO_DO_RANKING, RANKING_PATH } from '../../../lib/content/ranking'

export { ORDENACAO_DO_RANKING, RANKING_PATH }


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

/** A populated render's URL. An unpopulated relationship is an id, and an id is not a picture. */
const urlDoAvatar = (avatar: RankingRow['avatarRender']): string | undefined =>
  typeof avatar === 'object' && avatar !== null && typeof avatar.url === 'string' ? avatar.url : undefined

/** The XP a profile carries. FR-043 leaves the total **uncapped**, so this is printed as it is
 *  stored; only `nivel` stops at the curve's ceiling. */
const xpDe = (perfil: RankingRow): number =>
  typeof perfil.xpTotal === 'number' && Number.isFinite(perfil.xpTotal) ? perfil.xpTotal : 0

/**
 * One place on the board: the position, the avatar, the name, the `@handle` and the XP total —
 * the four things US6 names, in the order it names them.
 *
 * A profile whose render has not been composed yet draws **no** `<img>` rather than an empty
 * frame: FR-007's rule about missing avatar art, applied to the page that lists everyone.
 */
function linha(perfil: RankingRow, posicao: number): ReactElement {
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
function resultado(perfis: RankingRow[] | null): ReactNode {
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

/**
 * `/ranking` — this lab's makers by XP, highest first, ties broken by handle. Read by anyone.
 *
 * The reader answers `null` for a failed read and `[]` for a lab with no makers (FR-022), and
 * those are two different screens. `TenantUnresolvedError` it rethrows, and so does this page by
 * not catching it: a host that belongs to no lab is the **site's** 404, never an error card.
 *
 * @example /ranking
 */
export default async function Page(): Promise<ReactElement> {
  const perfis = await readPublicRanking(LIMITE_DO_RANKING)

  return (
    <main style={ESTILO.pagina}>
      <section style={ESTILO.hero}>
        <h1 style={ESTILO.heroTitulo}>RANKING</h1>
        <p style={ESTILO.heroTexto}>
          Os makers deste lab por XP acumulado. Empates são desempatados pelo @handle, para que a
          ordem seja sempre a mesma.
        </p>
      </section>
      <section style={ESTILO.conteudo}>{resultado(perfis)}</section>
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
}
