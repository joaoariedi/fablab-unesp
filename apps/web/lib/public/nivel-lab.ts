import { nivelDoLab, type NivelDoLab } from '../content/xp'
import { TenantUnresolvedError } from '../tenancy/errors'
import { getPublicLabLevelStoreForRSC } from '../tenancy/public-payload'

/**
 * `nivelDoLab`'s first parameter, which this path has nothing to put in.
 *
 * The request is used for one thing — handed to `deps.getStore` to open the choke point — and
 * this reader supplies the store itself, so nothing on the object is ever touched. `as never`
 * rather than a plausible-looking request, for the reason `/minha-conta/excluir` records at its
 * own injected call: a fabricated `req` carrying headers would make the default path look like
 * it works, and the default path is precisely what cannot work here — it resolves a session,
 * and this reader exists for a visitor who has none.
 */
const SEM_PEDIDO = {} as never

/**
 * T023 / FR-016, CLR-001 — **the lab's level, for a visitor with no account.**
 *
 * ── The defect this closes, and why it was a decision rather than a fix ─────────────────────
 *
 * Phase 4 shipped the card reading through `getTenantScopedPayloadForRSC`, which is
 * `overrideAccess: false` with the session user, and `scopedAccess()` opens with
 * `if (!user) return false`. So on a page whose primary audience has no account, the card
 * rendered *"Não foi possível carregar"* — while FR-016 and CLR-001 both say it is visible to
 * everyone. None of the card's six tests saw it: every one injected a store that answers.
 *
 * It is the shape of the ranking's phase-2 problem and it did **not** have the same answer. A
 * projection made `perfilMaker` safe because the board draws columns of a row. This card draws
 * no row at all — it needs a sum over `xpLedger`, whose entries are the lab's whole XP history.
 * The decision taken (2026-09-21) was the narrower of the two on the table: a reader that
 * returns only the aggregate and never rows, rather than a narrower statement of FR-016.
 *
 * ── Where the bound actually is ─────────────────────────────────────────────────────────────
 *
 * Not here. This function returns `NivelDoLab`, and a return type erases at runtime — the same
 * thing D2 was wrong about once already. The bound is `getPublicLabLevelStore`, which serves two
 * collections, forces `CAMPOS_DA_SOMA` onto every `xpLedger` read and refuses a `where`: the
 * rows carrying *who earned what, for which action, when* are never fetched, rather than fetched
 * into an elevated anonymous context and dropped by a mapping.
 *
 * ── One path for everyone, signed in or out ─────────────────────────────────────────────────
 *
 * The lab level is collective (FR-012) and the number is identical either way, so a signed-in
 * visitor reads it through this door too. Two paths would be two behaviours to keep in
 * agreement, and the signed-in one is the one whose tests passed while the requirement failed.
 *
 * ── The contract the card is written against ────────────────────────────────────────────────
 *
 * **Two outcomes, never three** (CLR-011): a value, or `null` for a failed read. There is no
 * `[]` here — `nivelDoLab` returns an object or throws, and a lab at level 0 with an empty
 * ledger is a *value*, the answer to a lab's first day rather than an emptiness (SC-014).
 *
 * `TenantUnresolvedError` is **rethrown**, as `readPublicRanking` rethrows it: a host belonging
 * to no lab is the site's 404, and a reader that swallowed it into `null` would draw an error
 * card on a page that should not exist (FR-025).
 *
 * @example
 *   const nivel = await readPublicLabLevel() // { xp: 16, nivel: 3, progresso: { atual: 1, de: 5 } }
 */
export async function readPublicLabLevel(): Promise<NivelDoLab | null> {
  try {
    const store = await getPublicLabLevelStoreForRSC()
    // Awaited INSIDE the try: a returned promise would reject outside this catch, and the throw
    // this reader exists to contain is `rulesForTenant`'s, raised during the read — a lab with
    // no `regrasXp` row has no economy, and a default curve would render a level nobody's
    // economy produced.
    return await nivelDoLab(SEM_PEDIDO, { getStore: async () => store })
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) throw erro
    console.warn('[home] a leitura pública do nível do lab falhou; quem chamou reporta o card.', erro)
    return null
  }
}
