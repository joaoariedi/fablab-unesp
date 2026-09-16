import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_missao_status" AS ENUM('rascunho', 'publicado');
  CREATE TYPE "public"."enum_missao_submissao_status" AS ENUM('enviada', 'aprovada', 'recusada');
  CREATE TABLE "missao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"titulo" varchar NOT NULL,
  	"descricao" varchar NOT NULL,
  	"icone_id" integer NOT NULL,
  	"skill_id" integer NOT NULL,
  	"status" "enum_missao_status" DEFAULT 'rascunho' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "missao_submissao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"missao_id" integer NOT NULL,
  	"maker_id" integer NOT NULL,
  	"comprovante_id" integer NOT NULL,
  	"status" "enum_missao_submissao_status" DEFAULT 'enviada' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "missao" ADD CONSTRAINT "missao_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao" ADD CONSTRAINT "missao_icone_id_midia_imagem_id_fk" FOREIGN KEY ("icone_id") REFERENCES "public"."midia_imagem"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao" ADD CONSTRAINT "missao_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao_submissao" ADD CONSTRAINT "missao_submissao_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao_submissao" ADD CONSTRAINT "missao_submissao_missao_id_missao_id_fk" FOREIGN KEY ("missao_id") REFERENCES "public"."missao"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao_submissao" ADD CONSTRAINT "missao_submissao_maker_id_perfil_maker_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."perfil_maker"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "missao_submissao" ADD CONSTRAINT "missao_submissao_comprovante_id_midia_imagem_id_fk" FOREIGN KEY ("comprovante_id") REFERENCES "public"."midia_imagem"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "missao_tenant_idx" ON "missao" USING btree ("tenant_id");
  CREATE INDEX "missao_icone_idx" ON "missao" USING btree ("icone_id");
  CREATE INDEX "missao_skill_idx" ON "missao" USING btree ("skill_id");
  CREATE INDEX "missao_updated_at_idx" ON "missao" USING btree ("updated_at");
  CREATE INDEX "missao_created_at_idx" ON "missao" USING btree ("created_at");
  CREATE INDEX "missao_submissao_tenant_idx" ON "missao_submissao" USING btree ("tenant_id");
  CREATE INDEX "missao_submissao_missao_idx" ON "missao_submissao" USING btree ("missao_id");
  CREATE INDEX "missao_submissao_maker_idx" ON "missao_submissao" USING btree ("maker_id");
  CREATE INDEX "missao_submissao_comprovante_idx" ON "missao_submissao" USING btree ("comprovante_id");
  CREATE INDEX "missao_submissao_status_idx" ON "missao_submissao" USING btree ("status");
  CREATE INDEX "missao_submissao_updated_at_idx" ON "missao_submissao" USING btree ("updated_at");
  CREATE INDEX "missao_submissao_created_at_idx" ON "missao_submissao" USING btree ("created_at");
  CREATE UNIQUE INDEX "missao_maker_idx" ON "missao_submissao" USING btree ("missao_id","maker_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "missao" CASCADE;
  DROP TABLE "missao_submissao" CASCADE;
  DROP TYPE "public"."enum_missao_status";
  DROP TYPE "public"."enum_missao_submissao_status";`)
}
