import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `projeto.autor`, nullable on the day it is created (T040, FR-034, CLR-002).
 *
 * `Projeto.ts` deferred `autor` to 005 by name; this is the database half. Note what the
 * generated SQL does **not** say: there is no `NOT NULL`, and no later migration will have to
 * drop one. That is the whole of CLR-002, and it is 004's bill paid forward —
 * `20260912_103126_autor_removivel_tombstone.ts` exists only because `artigo`, `aula` and
 * `modelo3d` declared `autor` required first, and undoing it took a migration *and* the removal
 * of `required: true` from the field config, because `push` rebuilds every non-production schema
 * from that config and `sameTenant` re-implements the `required` floor itself.
 *
 * Unlike that migration this one is generated and **does** carry its `.json` snapshot: the
 * column is nullable because the field is not `required`, so the generator's view of the schema
 * equals the config's, which is the only question `scripts/migration-drift.sh` asks.
 *
 * What holds it in place is `tests/tenancy/autor-nulavel.test.ts`, which reads
 * `information_schema` after a real boot rather than this file's text — because on every
 * non-production database it is `push`, not this migration, that decides the column's shape.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projeto" ADD COLUMN "autor_id" integer;
  ALTER TABLE "projeto" ADD CONSTRAINT "projeto_autor_id_perfil_maker_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."perfil_maker"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "projeto_autor_idx" ON "projeto" USING btree ("autor_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projeto" DROP CONSTRAINT "projeto_autor_id_perfil_maker_id_fk";
  
  DROP INDEX "projeto_autor_idx";
  ALTER TABLE "projeto" DROP COLUMN "autor_id";`)
}
