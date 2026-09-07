import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `projeto.imagemCapa` becomes a relationship to `midiaImagem` (decision D3 revised).
 *
 * **The cover-image foreign key is hand-changed to `ON DELETE restrict`.** Payload generates
 * `set null` for every relationship, and `required: true` generates a `NOT NULL` column — the
 * two are unsatisfiable together, and Postgres does not find out until someone deletes a
 * referenced row: the `SET NULL` violates the NOT NULL, the statement fails, and the whole
 * transaction aborts with `25P02` several frames away from the cause. Measured here: deleting
 * media wholesale in one suite took two unrelated suites down with an error naming
 * `payload_preferences`.
 *
 * `restrict` is also the behaviour the field's own comment promises — deleting an image a
 * project depends on is refused rather than silently orphaning a card. `migrations.test.ts`
 * asserts it, so a regenerated migration that reverts to `set null` fails rather than
 * reintroducing the abort.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "projeto_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"midia_imagem_id" integer,
  	"midia_modelo3d_id" integer,
  	"midia_documento_id" integer
  );
  
  ALTER TABLE "projeto_galeria" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "projeto_arquivos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "projeto_galeria" CASCADE;
  DROP TABLE "projeto_arquivos" CASCADE;
  ALTER TABLE "projeto" ADD COLUMN "imagem_capa_id" integer NOT NULL;
  ALTER TABLE "projeto_rels" ADD CONSTRAINT "projeto_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projeto_rels" ADD CONSTRAINT "projeto_rels_midia_imagem_fk" FOREIGN KEY ("midia_imagem_id") REFERENCES "public"."midia_imagem"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projeto_rels" ADD CONSTRAINT "projeto_rels_midia_modelo3d_fk" FOREIGN KEY ("midia_modelo3d_id") REFERENCES "public"."midia_modelo3d"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projeto_rels" ADD CONSTRAINT "projeto_rels_midia_documento_fk" FOREIGN KEY ("midia_documento_id") REFERENCES "public"."midia_documento"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "projeto_rels_order_idx" ON "projeto_rels" USING btree ("order");
  CREATE INDEX "projeto_rels_parent_idx" ON "projeto_rels" USING btree ("parent_id");
  CREATE INDEX "projeto_rels_path_idx" ON "projeto_rels" USING btree ("path");
  CREATE INDEX "projeto_rels_midia_imagem_id_idx" ON "projeto_rels" USING btree ("midia_imagem_id");
  CREATE INDEX "projeto_rels_midia_modelo3d_id_idx" ON "projeto_rels" USING btree ("midia_modelo3d_id");
  CREATE INDEX "projeto_rels_midia_documento_id_idx" ON "projeto_rels" USING btree ("midia_documento_id");
  ALTER TABLE "projeto" ADD CONSTRAINT "projeto_imagem_capa_id_midia_imagem_id_fk" FOREIGN KEY ("imagem_capa_id") REFERENCES "public"."midia_imagem"("id") ON DELETE restrict ON UPDATE no action;
  CREATE INDEX "projeto_imagem_capa_idx" ON "projeto" USING btree ("imagem_capa_id");
  ALTER TABLE "projeto" DROP COLUMN "imagem_capa";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "projeto_galeria" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"chave" varchar NOT NULL
  );
  
  CREATE TABLE "projeto_arquivos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"chave" varchar NOT NULL
  );
  
  ALTER TABLE "projeto_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "projeto_rels" CASCADE;
  ALTER TABLE "projeto" DROP CONSTRAINT "projeto_imagem_capa_id_midia_imagem_id_fk";
  
  DROP INDEX "projeto_imagem_capa_idx";
  ALTER TABLE "projeto" ADD COLUMN "imagem_capa" varchar NOT NULL;
  ALTER TABLE "projeto_galeria" ADD CONSTRAINT "projeto_galeria_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projeto_arquivos" ADD CONSTRAINT "projeto_arquivos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "projeto_galeria_order_idx" ON "projeto_galeria" USING btree ("_order");
  CREATE INDEX "projeto_galeria_parent_id_idx" ON "projeto_galeria" USING btree ("_parent_id");
  CREATE INDEX "projeto_arquivos_order_idx" ON "projeto_arquivos" USING btree ("_order");
  CREATE INDEX "projeto_arquivos_parent_id_idx" ON "projeto_arquivos" USING btree ("_parent_id");
  ALTER TABLE "projeto" DROP COLUMN "imagem_capa_id";`)
}
