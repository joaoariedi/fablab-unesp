import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  
  ALTER TABLE "projeto" ADD COLUMN "descricao_completa" jsonb;
  ALTER TABLE "projeto" ADD COLUMN "imagem_capa" varchar NOT NULL;
  ALTER TABLE "projeto" ADD COLUMN "downloads" numeric DEFAULT 0 NOT NULL;
  ALTER TABLE "projeto_galeria" ADD CONSTRAINT "projeto_galeria_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projeto_arquivos" ADD CONSTRAINT "projeto_arquivos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "projeto_galeria_order_idx" ON "projeto_galeria" USING btree ("_order");
  CREATE INDEX "projeto_galeria_parent_id_idx" ON "projeto_galeria" USING btree ("_parent_id");
  CREATE INDEX "projeto_arquivos_order_idx" ON "projeto_arquivos" USING btree ("_order");
  CREATE INDEX "projeto_arquivos_parent_id_idx" ON "projeto_arquivos" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "projeto_galeria" CASCADE;
  DROP TABLE "projeto_arquivos" CASCADE;
  ALTER TABLE "projeto" DROP COLUMN "descricao_completa";
  ALTER TABLE "projeto" DROP COLUMN "imagem_capa";
  ALTER TABLE "projeto" DROP COLUMN "downloads";`)
}
