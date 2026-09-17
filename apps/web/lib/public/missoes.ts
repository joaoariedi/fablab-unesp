import type { EstadoPessoal, SubmissaoDoc } from '../content/missoes'
import { getTenantScopedPayloadForRSC, type TenantScopedPayload } from '../tenancy'
import { currentUser } from '../tenancy/session'

/**
 * T017 / FR-008, FR-010 — **the personal half of a mission card: who is reading, and what they
 * have done about these missions.**
 *
 * Until this module existed it lived inside `app/(frontend)/missoes/page.tsx`. From T018 onward
 * two screens need it — `/missoes` and the Home's `MISSÕES EM DESTAQUE` band — and two pages
 * importing each other's page module is not an option, which is the whole of plan.md § D3.
 *
 * ── Why the RSC half is here and not in `lib/content/` ──────────────────────────────────────
 *
 * `lib/content/` keeps a convention: `xp.ts`, `counters.ts` and `skill-catalogue.ts` each take a
 * `req` and a `deps` bag, are testable with a named fake, and none of them reaches for
 * `next/headers`. {@link estadoPessoal} calls `getTenantScopedPayloadForRSC` and `currentUser`,
 * both of which read the request — RSC-only. So the pure model (`ETAPAS_DA_MISSAO`,
 * `ETAPAS_POR_ESTADO`, `estadoDe`, the types) stayed in `lib/content/missoes.ts` and the reader
 * lives here in `lib/public/`, beside `listing.ts`, which is where this codebase already keeps
 * page-facing readers.
 *
 * ── "Their own" is a constraint on the QUERY, not a filter on the render (FR-008) ────────────
 *
 * `missaoSubmissao.read` is `scopedAccess()` — scoped to the **lab**, not to the row, which
 * `MissaoSubmissao.ts` records as a known gap that closes in the shared access layer. A reader
 * that fetched the lab's submissions and picked its own out of the result would therefore be
 * *allowed* to, and would be one forgotten `.filter` away from drawing a lab-mate's 100% on this
 * visitor's card. The `maker` constraint is built from the session-resolved profile and named in
 * the `where`, so the rows never arrive in the first place.
 *
 * ── No client parameter on the page-facing entry point ──────────────────────────────────────
 *
 * {@link estadoPessoal} opens the door itself, exactly as `listing.ts` does and for the same
 * reason (T002, run 1): a `db` argument here is a seam a page could reach, and a page that can
 * pass a client can pass one with no tenant constraint at all. {@link submissoesDoMaker} takes
 * one because it is the inner step and its caller is this module.
 *
 * @example
 *   const pessoal = await estadoPessoal(missoes ?? [])
 *   const submissao = pessoal.tipo === 'maker' ? pessoal.submissoes.get(String(missao.id)) : undefined
 */

/**
 * As much of a mission as the personal read needs: its id.
 *
 * Deliberately not `MissaoDoc` — `/missoes` populates `icone` and `skill` at `depth: 1` and the
 * Home's band reads different fields again, and neither is any of this reader's business. A
 * structural minimum is also what lets both callers pass their own document type unchanged.
 */
export type MissaoIdentificada = { readonly id?: string | number }

/** The id a submission's `missao` names, whether it arrived populated or as a bare id. */
function idDaMissao(submissao: SubmissaoDoc): string {
  const missao = submissao.missao
  if (typeof missao === 'object' && missao !== null) return String(missao.id ?? '')
  return String(missao ?? '')
}

/**
 * This maker's own submissions, keyed by mission.
 *
 * The `maker` constraint comes from the profile resolved from the **session** — never from
 * anything the request carries — which is the whole of "their own" (see the docstring). The
 * `missao` constraint is not security, it is scope: the map only has to answer for the missions
 * on screen.
 */
export async function submissoesDoMaker(
  db: TenantScopedPayload,
  perfilId: string | number,
  missoes: readonly MissaoIdentificada[],
): Promise<ReadonlyMap<string, SubmissaoDoc>> {
  const ids = missoes.map((missao) => missao.id).filter((id): id is string | number => id !== undefined)
  if (ids.length === 0) return new Map()

  const { docs } = await db.find<SubmissaoDoc>({
    collection: 'missaoSubmissao',
    where: { and: [{ maker: { equals: perfilId } }, { missao: { in: ids } }] },
    depth: 0,
    // One row per mission per maker, forever (FR-023), so the ceiling is the number of missions
    // asked about — never Payload's default 10, which would drop a maker's own progress.
    limit: ids.length,
  })

  return new Map(docs.map((submissao) => [idDaMissao(submissao), submissao]))
}

/**
 * Who is reading, and what they have done about these missions.
 *
 * A failed personal read is `indisponivel` rather than an exception: the catalogue is public and
 * still worth showing, and one outage costs the personal layer instead of the whole screen —
 * the same rule Minha Conta applies block by block. CLR-013 adds that the Home must *say so*
 * when it lands, which is the caller's copy, not this reader's job.
 *
 * **The session lookup is inside the guarded region, and `/missoes` had it outside.** That is the
 * one deliberate difference from the code this module was moved out of. On `/missoes` a thrown
 * `currentUser()` cost a page that was already reading the same database; on the Home this read
 * is awaited by `HomePage` itself and is *not* one of the four that catch their own failure
 * (plan § Sketch 1, CLR-012), so a rejection here is a blank Home rather than a band without
 * percentages — which is exactly what FR-010 forbids.
 */
export async function estadoPessoal(missoes: readonly MissaoIdentificada[]): Promise<EstadoPessoal> {
  try {
    const usuario = await currentUser()
    if (!usuario) return { tipo: 'anonimo' }

    const db = await getTenantScopedPayloadForRSC()
    const { docs } = await db.find<{ id: string | number }>({
      collection: 'perfilMaker',
      where: { usuario: { equals: usuario.id } },
      limit: 1,
      depth: 0,
    })

    const perfil = docs[0]
    // One login may hold profiles in two labs (002 § CLR-002). No profile *here* means there is
    // no progress of theirs to show on this lab's missions, and reaching for the other lab's
    // would be the cross-tenant read the tenancy boundary forbids.
    if (!perfil) return { tipo: 'sem-perfil' }

    return { tipo: 'maker', submissoes: await submissoesDoMaker(db, perfil.id, missoes) }
  } catch (erro) {
    console.warn('[missoes] a leitura do progresso pessoal falhou; o catálogo segue visível.', erro)
    return { tipo: 'indisponivel' }
  }
}
