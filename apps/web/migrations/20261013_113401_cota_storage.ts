import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Every organization gets a storage quota, and none can lose it (007 — FR-021, FR-033, CLR-004).
 *
 * **The backfill is hand-added, and the migration fails without it.** drizzle generates
 * `SET DEFAULT` then `SET NOT NULL`, and a default applies only to rows inserted AFTER it: every
 * existing organization keeps its NULL, so `SET NOT NULL` aborts. Research F3 measured every row
 * as NULL on 2026-09-22 — this column had never been written by anything.
 *
 * `20480` is written as a literal, not imported from `DEFAULT_STORAGE_QUOTA_MB`: a migration
 * records what was true when it ran, and a later change to the default must not rewrite history.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organizations" ALTER COLUMN "storage_quota_mb" SET DEFAULT 20480;
  UPDATE "organizations" SET "storage_quota_mb" = 20480 WHERE "storage_quota_mb" IS NULL;
  ALTER TABLE "organizations" ALTER COLUMN "storage_quota_mb" SET NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organizations" ALTER COLUMN "storage_quota_mb" DROP DEFAULT;
  ALTER TABLE "organizations" ALTER COLUMN "storage_quota_mb" DROP NOT NULL;`)
}
