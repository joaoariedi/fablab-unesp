import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * One host, one organization (007 checklist CHK027).
 *
 * **If this fails with a duplicate-key error, it is doing its job.** It means two organizations
 * already declare the same domain — the state in which host resolution handed that host to the
 * newer of the two. Do not drop the index to get past it: decide which organization owns the
 * host, remove the other's claim in `/admin`, and run the migration again.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE UNIQUE INDEX "organizations_domains_domain_idx" ON "organizations_domains" USING btree ("domain");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "organizations_domains_domain_idx";`)
}
