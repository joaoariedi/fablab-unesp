import type { StatusSubmissao } from '../../collections/content/MissaoSubmissao'

/**
 * T015 / FR-007 — **the mission's two-step model, expressed once.**
 *
 * FR-007: *"The arithmetic is expressed once and shared with `/missoes`, never restated."* Until
 * this module existed it lived in `app/(frontend)/missoes/page.tsx`, and the Home's band needs
 * the same curve. Two pages importing each other's page module is not an option, so the shared
 * module is the only shape that lets "expressed once" be literally true.
 *
 * ── Why this half is separate from the reader (plan.md § D3) ────────────────────────────────
 *
 * `lib/content/` has a convention worth keeping: `xp.ts`, `counters.ts` and `skill-catalogue.ts`
 * each take a `req` and a `deps` bag and are testable with a named fake, and none of them
 * reaches for `next/headers`. The personal reader — `estadoPessoal`, `submissoesDoMaker` — calls
 * `getTenantScopedPayloadForRSC`, which is RSC-only, so it lives in `lib/public/` beside
 * `listing.ts` where this codebase already keeps page-facing readers. What is left here is pure:
 * two constants, one narrowing function and the types they speak in, unit-testable with no
 * database at all. `tests/content/missoes-model.test.ts` asserts that purity against this file's
 * own source text, because the day an RSC import lands here the split stops being real and
 * nothing else would notice.
 *
 * ── Why the percentage is two steps and not a mockup number ─────────────────────────────────
 *
 * `home.md` § MISSÕES EM DESTAQUE draws `50%` / `30%` / `0%` and says of those numbers nothing
 * at all — they are art. What the data models is a review: a maker sends the proof, the team
 * validates it (FR-021). That is two steps. `ProgressBar` takes value/max in the caller's units
 * precisely so this arithmetic stays here and the rounding stays there.
 */

/** Re-exported so a caller speaks the review vocabulary without reaching into the collection —
 *  `collections/` is the admin surface, and a page importing one field's union from it is the
 *  kind of edge that makes the model feel like it lives in two places. */
export type { StatusSubmissao }

/**
 * One submission as the personal read returns it at `depth: 0` — `missao` is an id, which is
 * all the keying needs.
 *
 * Structural rather than imported from `payload-types.ts`, which is gitignored: a module that
 * imported a generated type would compile locally and fail CI (tasks.md § "Read before
 * starting", item 8). `status` is a bare `string` on purpose — it is the untrusted end of the
 * narrowing {@link estadoDe} performs, and typing it as `StatusSubmissao` here would assume the
 * very thing that function exists to check.
 */
export type SubmissaoDoc = {
  readonly id?: string | number
  readonly missao?: { readonly id?: string | number } | number | string | null
  readonly status?: string
}

/**
 * What a page knows about the person reading it.
 *
 * Four states and not a boolean: "signed out" is the only one that gets the invitation to sign
 * in, and `sem-perfil` (a login with no profile in *this* lab — 002 § CLR-002 allows exactly
 * that) and `indisponivel` (the personal read failed) must show no percentage **and** no
 * invitation, because inviting a signed-in person to sign in is a loop they cannot leave.
 *
 * `indisponivel` is a state rather than a thrown error so that one outage costs the personal
 * layer instead of the whole screen — the same rule Minha Conta applies block by block. CLR-013
 * adds that the Home must *say so* when it lands, because silence there is character-for-
 * character the signed-out card and a signed-in maker reads it as having been logged out.
 */
export type EstadoPessoal =
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'sem-perfil' }
  | { readonly tipo: 'indisponivel' }
  | { readonly tipo: 'maker'; readonly submissoes: ReadonlyMap<string, SubmissaoDoc> }

/**
 * A mission is done in two steps: the maker sends the proof, the team validates it (FR-021).
 *
 * The scale, not a percentage: `ProgressBar` rounds, and `percentOf` is its one rounding.
 */
export const ETAPAS_DA_MISSAO = 2

/**
 * How many of those steps each review state represents.
 *
 * `satisfies Record<StatusSubmissao, number>` against the collection's **own** vocabulary, so a
 * fourth review state added to `MissaoSubmissao.ts` breaks the typecheck here instead of
 * rendering as 0% — a mission silently reported as not started is the failure nobody sees.
 *
 * **`recusada` is 0 and not "half"** (CLR-003, corrected 2026-09-16 against the shipped model):
 * nothing was credited, and CLR-015 reopens the row on the maker's next photo, so the work still
 * ahead of them is the whole of it. The spec's first draft of that clarification said "awaiting
 * review or rejected 50%"; it was written against the mockup rather than against this record,
 * and the correction is noted here because the uncorrected sentence is still readable in the
 * spec's history.
 */
export const ETAPAS_POR_ESTADO = {
  enviada: 1,
  aprovada: ETAPAS_DA_MISSAO,
  recusada: 0,
} satisfies Record<StatusSubmissao, number>

/**
 * The review state this row is in, narrowed to the collection's vocabulary — an unknown value is
 * treated as **no submission at all** rather than indexed into a record that has no such key.
 *
 * ```ts
 * estadoDe({ id: 7, missao: 3, status: 'enviada' }) // → 'enviada'
 * estadoDe({ id: 7, missao: 3, status: 'arquivada' }) // → undefined, not a 0% bar
 * ```
 *
 * The obvious membership test — `status in ETAPAS_POR_ESTADO` — is wrong, and wrong invisibly:
 * `in` walks the prototype chain, so `'toString'`, `'constructor'` and every other `Object.prototype`
 * key pass it, and the caller then reads `ETAPAS_POR_ESTADO['toString']`, gets a function where
 * it expected a number, and hands that to `ProgressBar`. `hasOwnProperty.call` is the fix, and it
 * is called off `Object.prototype` rather than off the record because a record is not guaranteed
 * to carry the method it is being asked about.
 */
export function estadoDe(submissao: SubmissaoDoc | undefined): StatusSubmissao | undefined {
  const status = submissao?.status
  if (status === undefined) return undefined
  return Object.prototype.hasOwnProperty.call(ETAPAS_POR_ESTADO, status)
    ? (status as StatusSubmissao)
    : undefined
}
