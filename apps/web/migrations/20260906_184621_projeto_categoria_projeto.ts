import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_projeto_status" AS ENUM('rascunho', 'em_revisao', 'publicado');
  CREATE TABLE "categoria_projeto" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "projeto" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"titulo" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"descricao_curta" varchar NOT NULL,
  	"categoria_id" integer NOT NULL,
  	"curtidas" numeric DEFAULT 0 NOT NULL,
  	"status" "enum_projeto_status" DEFAULT 'rascunho' NOT NULL,
  	"aprovacao_registrada" boolean DEFAULT false,
  	"aprovado_em" timestamp(3) with time zone,
  	"data_publicacao" timestamp(3) with time zone,
  	"destaque" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "projeto_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categoria_projeto_id" integer;
  ALTER TABLE "categoria_projeto" ADD CONSTRAINT "categoria_projeto_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projeto" ADD CONSTRAINT "projeto_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projeto" ADD CONSTRAINT "projeto_categoria_id_categoria_projeto_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_projeto"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projeto_texts" ADD CONSTRAINT "projeto_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projeto"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "categoria_projeto_tenant_idx" ON "categoria_projeto" USING btree ("tenant_id");
  CREATE INDEX "categoria_projeto_slug_idx" ON "categoria_projeto" USING btree ("slug");
  CREATE INDEX "categoria_projeto_updated_at_idx" ON "categoria_projeto" USING btree ("updated_at");
  CREATE INDEX "categoria_projeto_created_at_idx" ON "categoria_projeto" USING btree ("created_at");
  CREATE INDEX "projeto_tenant_idx" ON "projeto" USING btree ("tenant_id");
  CREATE INDEX "projeto_slug_idx" ON "projeto" USING btree ("slug");
  CREATE INDEX "projeto_categoria_idx" ON "projeto" USING btree ("categoria_id");
  CREATE INDEX "projeto_updated_at_idx" ON "projeto" USING btree ("updated_at");
  CREATE INDEX "projeto_created_at_idx" ON "projeto" USING btree ("created_at");
  CREATE INDEX "projeto_texts_order_parent" ON "projeto_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categoria_projeto_fk" FOREIGN KEY ("categoria_projeto_id") REFERENCES "public"."categoria_projeto"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_categoria_projeto_id_idx" ON "payload_locked_documents_rels" USING btree ("categoria_projeto_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categoria_projeto" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "projeto" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "projeto_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "categoria_projeto" CASCADE;
  DROP TABLE "projeto" CASCADE;
  DROP TABLE "projeto_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categoria_projeto_fk";
  
  DROP INDEX "payload_locked_documents_rels_categoria_projeto_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categoria_projeto_id";
  DROP TYPE "public"."enum_projeto_status";`)
}
