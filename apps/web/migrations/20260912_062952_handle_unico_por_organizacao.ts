import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * T019 / FR-010, SC-009 — **`@handle` unique within one organization**.
 *
 * Generated from the `afterSchemaInit` hook in `lib/tenancy/handle-unique-index.ts`, which is where
 * the reasoning lives. The two must stay together: `push` builds every non-production database
 * from the hook and would drop an index it did not recognise, and production runs this file and
 * never pushes. An index in one and not the other is the drift `docs/tech-stack.md` calls risk
 * number one — and here it would surface as the signup race T021 exists to prove cannot happen.
 *
 * Per **organization**, not per table: a global unique handle would refuse the second profile
 * of anyone who joins a second lab, which is the case CLR-002 exists to permit.
 *
 * `up()` fails on a database that already holds two profiles sharing a handle inside one
 * organization. Nothing has ever written one — the handle is derived at creation and this index
 * lands before the first signup path does (T020, T027) — but if it ever does, the duplicates
 * have to be resolved before this runs; the index cannot choose which maker keeps the name.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE UNIQUE INDEX "perfil_maker_tenant_handle_unique_idx" ON "perfil_maker" USING btree ("tenant_id","handle");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "perfil_maker_tenant_handle_unique_idx";`)
}
