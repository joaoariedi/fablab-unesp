import type { PayloadRequest } from 'payload'

import { MEGABYTE } from '../uploads/limits'
import { getSystemScopedPayload } from './system-payload'

/** One organization's storage quota and what it has used, both in MB of 1024 × 1024 bytes. */
export type OrganizationUsage = { quotaMb: number; usedMb: number }

export type OrganizationUsageStore = {
  /** The quota and the STORED used figure — one read, never a recompute (plan § D6b). */
  read(): Promise<OrganizationUsage>
  /** Adds `bytes` (negative to release) to the stored figure and returns the result. */
  applyDelta(bytes: number): Promise<OrganizationUsage>
}

export type OrganizationUsageOptions = {
  /**
   * The request the upload is running under. Propagated so the delta joins ITS transaction: a
   * failed S3 upload then rolls the figure back with the row, instead of leaving it counting
   * bytes that were never stored (007 checklist CHK008).
   */
  req?: PayloadRequest
}

/**
 * **The seventh enumerated consumer of the system client** — and its reach is the question it was
 * opened for (007, plan § D4/D5, FR-022, FR-028).
 *
 * An upload by a maker must know its organization's quota and change its used figure, and
 * `organizations` is `masterOnly()` on every verb: the request-scoped client refuses both, for
 * every user who is not a master. So this goes through the system client, which runs with
 * `overrideAccess: true` — the most dangerous object in the codebase, which is why its consumers
 * are fenced into `lib/tenancy/` and enumerated rather than discovered.
 *
 * **The bound is the shape, not a check.** `getPublicCounterStore` opens a full client and refuses
 * the operations it was not opened for; this exposes only `read` and `applyDelta`, on two columns
 * of the one organization named when it was opened. There is no collection, id or field argument
 * for a caller to widen — nothing to refuse, because nothing else can be expressed.
 *
 * **The tenant is the caller's to get right**, from the document being written — never the host.
 * `seed-on-create.ts` documents a master acting on organization B while served on another host,
 * and T005 measured that a write's tenant arrives explicitly in its data. Whether the writer may
 * name that tenant at all is the `tenant` field's own guard (`tenantMustBeAMembership`), which runs
 * before any hook that calls this.
 *
 * @example
 *   const store = await getOrganizationUsageStore(String(doc.tenant), { req })
 *   await store.applyDelta(bytesOf(doc))
 */
export async function getOrganizationUsageStore(
  tenantId: string,
  options: OrganizationUsageOptions = {},
): Promise<OrganizationUsageStore> {
  const sys = await getSystemScopedPayload(tenantId, options.req ? { req: options.req } : {})

  const read = async (): Promise<OrganizationUsage> => {
    const org = await sys.findByID<{ storageQuotaMb?: unknown; storageUsedMb?: unknown }>({
      collection: 'organizations',
      id: tenantId,
      depth: 0,
    })
    if (!org) throw new Error(`organization ${tenantId} does not exist, so it has no storage quota`)
    // A missing quota is refused, not read as 0 (which suspends every upload) nor as unlimited
    // (which is the quota failing silently): after migration 20261013_113401 the column is never
    // null, so a null means that migration did not run here.
    if (typeof org.storageQuotaMb !== 'number') {
      throw new Error(
        `organization ${tenantId} has no storage quota (got ${JSON.stringify(org.storageQuotaMb)}). ` +
          'The column is non-null since migration 20261013_113401_cota_storage — run `payload migrate`.',
      )
    }
    return { quotaMb: org.storageQuotaMb, usedMb: Number(org.storageUsedMb ?? 0) }
  }

  return {
    read,
    applyDelta: async (bytes) => {
      if (!Number.isFinite(bytes)) throw new Error(`applyDelta needs a finite byte count; got ${String(bytes)}`)
      const atual = await read()
      // Summed in whole bytes, then turned back into MB: adding MB fractions directly would let
      // floating-point error accumulate one upload at a time. Clamped at zero, as `counters.ts`
      // clamps its own deltas — releasing a file counted before this feature existed must not
      // drive the figure negative; the reconciliation gate is what catches the drift.
      const bytesAgora = Math.max(0, Math.round(atual.usedMb * MEGABYTE) + Math.round(bytes))
      const usedMb = bytesAgora / MEGABYTE
      await sys.update({ collection: 'organizations', id: tenantId, data: { storageUsedMb: usedMb } })
      return { quotaMb: atual.quotaMb, usedMb }
    },
  }
}
