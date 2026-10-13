import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * One-time backfill of `organizations.storage_used_mb` from the uploads already stored (007 — T007,
 * FR-028, FR-031).
 *
 * From this feature on, every upload, replacement and deletion moves the figure by a delta
 * (`lib/content/storage-usage.ts`). A delta sees only what happens after it exists, so a database
 * that already held uploads would keep a figure of 0 — and a quota enforced against it would let
 * that lab past its limit by everything it uploaded before the upgrade. This sets every
 * organization's figure to what its uploads occupy NOW, after which the delta keeps it true.
 *
 * **Every organization, not only those with uploads**: a stale figure on a lab with no uploads is
 * reset to 0 too, so the reconciliation gate (`tests/content/counters.test.ts`) starts clean.
 *
 * **Frozen SQL, not a call into the app.** This is `bytesOf` as it stood on 2026-10-13 — the
 * original plus each generated size, in MB of 1024 × 1024 bytes — written out against the columns
 * that existed then (`midia_imagem` carries `sizes_miniatura_filesize` and `sizes_card_filesize`;
 * the other two collections generate no sizes). A migration that imported `bytesOf` would change
 * what it did the day `bytesOf` changed, rewriting history for every database that runs it later.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "organizations" o SET "storage_used_mb" = COALESCE((
      SELECT SUM(t.bytes) FROM (
        SELECT "tenant_id", COALESCE("filesize", 0)
               + COALESCE("sizes_miniatura_filesize", 0)
               + COALESCE("sizes_card_filesize", 0) AS bytes
          FROM "midia_imagem"
        UNION ALL
        SELECT "tenant_id", COALESCE("filesize", 0) FROM "midia_modelo3d"
        UNION ALL
        SELECT "tenant_id", COALESCE("filesize", 0) FROM "midia_documento"
      ) t WHERE t."tenant_id" = o."id"
    ), 0) / 1048576.0;`)
}

/**
 * Nothing to undo. The figure this replaced was 0 or stale, never a value anyone chose, so there
 * is no earlier state to restore — and the column itself is unchanged by this migration.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {}
