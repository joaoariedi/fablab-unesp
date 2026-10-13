import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_STORAGE_QUOTA_MB } from '../../collections/Organizations'
import { up } from '../../migrations/20261013_113401_cota_storage'
import config from '../../payload.config'

/**
 * T004 / FR-021, FR-033, FR-033b, SC-011c — the quota column, asked of the DATABASE.
 *
 * Every assertion about the column's shape reads `information_schema` after a real boot, never
 * the field config: `push` rebuilds this schema from the config, so a test of the config would
 * pass whatever the migration did (recurring-defect class 2 — ask the authority).
 *
 * **§3 tests the migration's backfill, which no other gate reaches.** `migration-drift.sh` applies
 * migrations to an EMPTY database, where there is no NULL row for the backfill to repair — so a
 * migration that forgot it passes the drift gate and fails on every real database. drizzle
 * generated exactly that (`SET DEFAULT` then `SET NOT NULL`, nothing between), and research F3
 * measured every pre-existing row as NULL. §3 recreates that state inside a transaction it rolls
 * back: test files run serially here (`fileParallelism: false`), so the brief DDL blocks no one.
 */

const SENTINEL = 'storage-quota-column-sentinel'
/** Thrown to roll §3's transaction back. Recognised by identity, so a real error still fails. */
const ROLLBACK = new Error('rollback — storage-quota-column §3')

let payload: Payload
let sentinelId: string | number

type Linha = Record<string, unknown>
const linhas = async (query: string): Promise<Linha[]> => {
  const resultado = await payload.db.drizzle.execute(query)
  return ((resultado as { rows?: unknown[] }).rows ?? resultado) as Linha[]
}

beforeAll(async () => {
  payload = await getPayload({ config })
  // Created WITHOUT a quota, so §2 can ask what the default gave it.
  const org = await payload.create({
    collection: 'organizations',
    data: { name: 'Sentinela da cota', slug: SENTINEL, status: 'active' } as never,
    overrideAccess: true,
  })
  sentinelId = org.id
}, 180_000)

afterAll(async () => {
  // Preamble item 5: a row left behind fails somebody else's whole-database reconciliation.
  await payload?.delete({ collection: 'organizations', id: sentinelId, overrideAccess: true })
})

describe('§1 — the column as the database holds it (FR-033)', () => {
  it('is NOT NULL with a default of the declared quota', async () => {
    const [coluna] = await linhas(
      `select is_nullable, column_default from information_schema.columns
       where table_name = 'organizations' and column_name = 'storage_quota_mb'`,
    )
    expect(coluna, 'organizations.storage_quota_mb does not exist').toBeDefined()
    expect(coluna?.is_nullable).toBe('NO')
    expect(String(coluna?.column_default)).toContain(String(DEFAULT_STORAGE_QUOTA_MB))
  })

  it('carries a quota on every organization — zero rows are NULL (SC-011c)', async () => {
    const [contagem] = await linhas(
      'select count(*)::int as nulos from organizations where storage_quota_mb is null',
    )
    expect(contagem?.nulos).toBe(0)
  })
})

describe('§2 — what a new organization gets, and what the field refuses (FR-021, FR-033b)', () => {
  it('gives an organization created without a quota the 20 GiB default', async () => {
    const org = await payload.findByID({ collection: 'organizations', id: sentinelId, depth: 0 })
    expect((org as { storageQuotaMb?: unknown }).storageQuotaMb).toBe(DEFAULT_STORAGE_QUOTA_MB)
  })

  it('accepts zero — suspension is a real state, not an error', async () => {
    const org = await payload.update({
      collection: 'organizations',
      id: sentinelId,
      data: { storageQuotaMb: 0 } as never,
      overrideAccess: true,
    })
    expect((org as { storageQuotaMb?: unknown }).storageQuotaMb).toBe(0)
  })

  it('refuses a negative quota, which would refuse every upload with a nonsensical allowance', async () => {
    await expect(
      payload.update({
        collection: 'organizations',
        id: sentinelId,
        data: { storageQuotaMb: -1 } as never,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
})

describe('§3 — the migration repairs the rows that predate it (FR-033)', () => {
  it('backfills a NULL quota before SET NOT NULL, instead of aborting', async () => {
    let depois: Linha | undefined
    let nulavelDepois: Linha | undefined

    await payload.db.drizzle
      .transaction(async (tx) => {
        // The state every real database was in: the column nullable, a row with no quota.
        await tx.execute(
          'alter table organizations alter column storage_quota_mb drop not null',
        )
        await tx.execute(
          `update organizations set storage_quota_mb = null where id = ${Number(sentinelId)}`,
        )

        await up({ db: tx as never, payload, req: {} as never })

        const lida = await tx.execute(
          `select storage_quota_mb from organizations where id = ${Number(sentinelId)}`,
        )
        depois = (((lida as { rows?: unknown[] }).rows ?? lida) as Linha[])[0]
        const coluna = await tx.execute(
          `select is_nullable from information_schema.columns
           where table_name = 'organizations' and column_name = 'storage_quota_mb'`,
        )
        nulavelDepois = (((coluna as { rows?: unknown[] }).rows ?? coluna) as Linha[])[0]
        throw ROLLBACK
      })
      .catch((erro: unknown) => {
        if (erro !== ROLLBACK) throw erro
      })

    expect(
      Number(depois?.storage_quota_mb),
      'the migration left a pre-existing organization without a quota. drizzle generates ' +
        '`SET DEFAULT` then `SET NOT NULL`, and a default reaches only rows inserted after it — ' +
        'so without the hand-added UPDATE between them, `SET NOT NULL` aborts on a real database.',
    ).toBe(DEFAULT_STORAGE_QUOTA_MB)
    expect(nulavelDepois?.is_nullable).toBe('NO')
  })
})
