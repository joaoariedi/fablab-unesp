import type { PayloadRequest, Where } from 'payload'

import { CrossTenantError, getTenantScopedPayload, type TenantScopedPayload } from '../tenancy'

/**
 * The **one** counter strategy every derived count uses (FR-020, T030, plan § Sketch 7).
 *
 * **Stored, not counted on read.** The alternative — a `count(*)` when a listing renders — is
 * an N+1 across exactly the card grids this design serves: `/projetos` draws twenty cards and
 * would issue twenty count queries, and again on the next page. So the derived value lives in
 * a column on the target document and a listing reads it for free.
 *
 * **Maintained inside the same transaction as the write that caused it.** This is the half a
 * stored counter usually gets wrong, and the failure is silent: the like commits, the recount
 * does not, and `curtidas` is permanently wrong with nothing reporting it. Payload joins an
 * operation to an open transaction through `req.transactionID`, so the mechanism is simply
 * that the **caller's own `req`** reaches the choke point — never a fresh one, never
 * `after: commit`. Three properties follow, and each is pinned by a test in
 * `tests/content/counter-strategy.test.ts`: the same request object goes in, the write is
 * awaited, and a failure propagates so the causing write rolls back with it.
 *
 * Same discipline as constitution Principle 3's "XP is granted inside the same transaction as
 * the action that caused it", applied to counters.
 *
 * **The drift this cannot prevent, named rather than hoped away.** A stored counter goes stale
 * the moment a source row is created or deleted by a path this function does not see — an
 * admin bulk delete, a migration, a manual SQL fix. The mitigation is not "be careful": it is
 * T031's reconciliation test, which recomputes every counter from its source rows and asserts
 * equality in CI. `count` is preferred over `delta` for exactly that reason — it recomputes
 * from the truth on every write, so it self-heals where a delta accumulates the error.
 *
 * **FR-024 holds here.** This module issues no `payload.find/update` and no SQL; it goes
 * through `lib/tenancy`, which is also what constrains the write to the target's own
 * organization. `getStore` is injectable because the *anonymous* download of FR-016 resolves
 * its organization from the host rather than from a session, and it must reach the counter
 * through a choke-point client of its own (T036) — not by widening this one.
 *
 * `formatos` on `modelo3d` is the fourth derived value of FR-020 and obeys this same rule —
 * derived at write, verified by the same reconciliation test — but it is not a counter and it
 * is not cross-document: it is the extensions of the very document being saved, so it belongs
 * in that collection's `beforeChange` (T039) rather than here.
 */

/** The stored counters of FR-020. `formatos` is derived on its own document — see above. */
export type CounterField = 'curtidas' | 'downloads' | 'totalModelos'

/** The document whose column is being maintained. */
export type CounterTarget = { collection: string; id: string | number }

/**
 * Where the truth lives for a `count` derivation. The tenant constraint is NOT stated here:
 * the choke point ANDs its own onto every query, and restating it invites a caller to write
 * a subtly different one.
 */
export type CounterSource = { collection: string; where: Where }

/**
 * One strategy, two derivations.
 *
 * `count` recomputes from the source rows and is the default choice — a `curtida` row exists
 * per like, so the stored value can be re-derived and is self-healing.
 *
 * `delta` is for a counter with **no source rows at all**: nothing is persisted per download,
 * so `downloads` can only be incremented. It carries a read-modify-write window that `count`
 * does not — two downloads in concurrent transactions can both read N and write N+1 — which
 * is the price of not storing a row per download, and the reason `count` is preferred
 * wherever source rows exist.
 */
export type CounterDerivation =
  | { kind: 'count'; source: CounterSource }
  | { kind: 'delta'; by: number }

/**
 * The slice of the choke-point client this needs. Narrowed to three operations so any
 * sanctioned client can satisfy it — including the one FR-016's anonymous download path must
 * bring — while `create` and `delete` stay out of reach of a counter.
 */
export type CounterStore = Pick<TenantScopedPayload, 'find' | 'findByID' | 'update'>

export type CounterDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests and by FR-016's path. */
  getStore?: (req: PayloadRequest) => Promise<CounterStore>
}

export type CounterSync = {
  /** The request the causing write is running under. Its transaction is the one joined. */
  req: PayloadRequest
  target: CounterTarget
  field: CounterField
  derive: CounterDerivation
}

/** `limit: 1` because only `totalDocs` is wanted — the rows themselves are never needed. */
const COUNT_ONLY = 1

const numberAt = (doc: Record<string, unknown> | null, field: CounterField): number => {
  const stored = doc?.[field]
  return typeof stored === 'number' ? stored : 0
}

const deriveValue = async (store: CounterStore, sync: CounterSync): Promise<number> => {
  if (sync.derive.kind === 'count') {
    const { totalDocs } = await store.find({
      collection: sync.derive.source.collection,
      where: sync.derive.source.where,
      limit: COUNT_ONLY,
      depth: 0,
    })
    return totalDocs
  }

  const current = await store.findByID<Record<string, unknown>>({
    collection: sync.target.collection,
    id: sync.target.id,
    depth: 0,
  })
  // Clamped at zero: the counter fields declare `min: 0`, so a negative would be refused by
  // Payload and roll back the *unlike* that produced it — the counter's own drift becoming
  // the user's failed action. A duplicate unlike is a no-op, not an error.
  return Math.max(0, numberAt(current, sync.field) + sync.derive.by)
}

/**
 * Derive the counter and store it, on the caller's transaction. Returns the stored value.
 *
 * @throws CrossTenantError when the update matches no row — a target in another organization,
 * or one deleted underneath the write. Silence there is the one drift path the transaction
 * cannot catch, because nothing failed.
 *
 * @example
 * // In the `curtida` collection, whose every write changes one project's total:
 * hooks: {
 *   afterChange: [
 *     async ({ req, doc }) =>
 *       syncCounter({
 *         req, // the like's own transaction — not a new one
 *         target: { collection: 'projeto', id: doc.alvo },
 *         field: 'curtidas',
 *         derive: { kind: 'count', source: { collection: 'curtida', where: { alvo: { equals: doc.alvo } } } },
 *       }),
 *   ],
 * }
 */
export async function syncCounter(sync: CounterSync, deps: CounterDeps = {}): Promise<number> {
  const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req))
  const store = await getStore(sync.req)

  const value = await deriveValue(store, sync)

  // Awaited, and its rejection deliberately uncaught: both are what keeps this write inside
  // the caller's transaction rather than racing it.
  const written = await store.update({
    collection: sync.target.collection,
    id: sync.target.id,
    data: { [sync.field]: value },
  })

  if (!written) {
    throw new CrossTenantError(
      `${sync.target.collection} ${String(sync.target.id)} matched no row in this organization, ` +
        `so ${sync.field} was not updated to ${String(value)}`,
    )
  }

  return value
}
