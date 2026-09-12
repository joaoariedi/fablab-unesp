import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The tombstone, database half (T029, FR-031, CLR-003).
 *
 * Deletion erases the person and KEEPS what they published, with authorship shown as a
 * tombstone. That is only possible if `autor` can hold nothing, and today the column refuses:
 * `20260907_063817_colecoes_002b.ts` created all three `autor_id` columns NOT NULL. Without
 * this, `deleteAccount`'s UPDATE fails mid-transaction and the whole erasure rolls back —
 * nothing deleted, and an error naming neither the person nor the article.
 *
 * **Additive.** Dropping a NOT NULL rejects no existing row and moves no data, so it applies to
 * a populated database as safely as to an empty one. Precedent, in reverse:
 * `20260907_122242_evento_inscricao_obrigatoria.ts`.
 *
 * **Written by hand, and it carries no `.json` snapshot — deliberately.** `required: true` stays
 * on `Artigo`, `Aula` and `Modelo3d`: an author is still mandatory when someone WRITES an
 * article, and the null is a state deletion produces rather than one a form may submit. The
 * column is therefore looser than the config describes, which is a shape `migrate:create`
 * cannot express — regenerating from a snapshot that recorded `notNull: false` would diff
 * against those three `required: true` fields and emit `SET NOT NULL`, putting the constraint
 * straight back and failing `scripts/migration-drift.sh` on the way. Leaving the snapshot at
 * `20260912_062952` keeps the generator's view of the schema equal to the config's, which is
 * the question that gate asks. `apps/web/tests/migrations.test.ts` is what holds the DROP in
 * place, because nothing derived from the collections ever will.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "artigo" ALTER COLUMN "autor_id" DROP NOT NULL;
   ALTER TABLE "aula" ALTER COLUMN "autor_id" DROP NOT NULL;
   ALTER TABLE "modelo3d" ALTER COLUMN "autor_id" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reversible only while no author has actually been erased: a row whose `autor_id` is already
  // null refuses SET NOT NULL. That is the correct failure — it says the rollback would have to
  // invent an author for published work whose author asked to be forgotten.
  await db.execute(sql`
   ALTER TABLE "artigo" ALTER COLUMN "autor_id" SET NOT NULL;
   ALTER TABLE "aula" ALTER COLUMN "autor_id" SET NOT NULL;
   ALTER TABLE "modelo3d" ALTER COLUMN "autor_id" SET NOT NULL;`)
}
