import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_xp_ledger_acao" AS ENUM('assistir_aula', 'publicar_projeto', 'publicar_modelo3d', 'publicar_artigo', 'concluir_missao');
  CREATE TYPE "public"."enum_xp_ledger_ref_tipo" AS ENUM('aula', 'projeto', 'modelo3d', 'artigo', 'missao');
  CREATE TABLE "regras_xp" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"xp_por_acao" numeric DEFAULT 1 NOT NULL,
  	"xp_por_nivel" numeric DEFAULT 5 NOT NULL,
  	"nivel_maximo" numeric DEFAULT 10 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "xp_ledger" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"perfil_id" integer,
  	"skill_id" integer,
  	"acao" "enum_xp_ledger_acao" NOT NULL,
  	"ref_tipo" "enum_xp_ledger_ref_tipo" NOT NULL,
  	"ref_id" numeric NOT NULL,
  	"quantidade" numeric NOT NULL,
  	"chave_idempotencia" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "perfil_maker" ADD COLUMN "xp_total" numeric DEFAULT 0;
  ALTER TABLE "perfil_maker" ADD COLUMN "nivel" numeric DEFAULT 0;
  ALTER TABLE "regras_xp" ADD CONSTRAINT "regras_xp_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_perfil_id_perfil_maker_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfil_maker"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "xp_ledger" ADD CONSTRAINT "xp_ledger_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "regras_xp_tenant_idx" ON "regras_xp" USING btree ("tenant_id");
  CREATE INDEX "regras_xp_updated_at_idx" ON "regras_xp" USING btree ("updated_at");
  CREATE INDEX "regras_xp_created_at_idx" ON "regras_xp" USING btree ("created_at");
  CREATE INDEX "xp_ledger_tenant_idx" ON "xp_ledger" USING btree ("tenant_id");
  CREATE INDEX "xp_ledger_perfil_idx" ON "xp_ledger" USING btree ("perfil_id");
  CREATE INDEX "xp_ledger_skill_idx" ON "xp_ledger" USING btree ("skill_id");
  CREATE INDEX "xp_ledger_acao_idx" ON "xp_ledger" USING btree ("acao");
  CREATE INDEX "xp_ledger_ref_id_idx" ON "xp_ledger" USING btree ("ref_id");
  CREATE INDEX "xp_ledger_updated_at_idx" ON "xp_ledger" USING btree ("updated_at");
  CREATE INDEX "xp_ledger_created_at_idx" ON "xp_ledger" USING btree ("created_at");
  CREATE UNIQUE INDEX "chaveIdempotencia_idx" ON "xp_ledger" USING btree ("chave_idempotencia");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "regras_xp" CASCADE;
  DROP TABLE "xp_ledger" CASCADE;
  ALTER TABLE "perfil_maker" DROP COLUMN "xp_total";
  ALTER TABLE "perfil_maker" DROP COLUMN "nivel";
  DROP TYPE "public"."enum_xp_ledger_acao";
  DROP TYPE "public"."enum_xp_ledger_ref_tipo";`)
}
