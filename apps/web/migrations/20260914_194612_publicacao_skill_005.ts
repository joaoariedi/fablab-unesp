import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projeto" ADD COLUMN "skill_id" integer;
  ALTER TABLE "artigo" ADD COLUMN "skill_id" integer;
  ALTER TABLE "modelo3d" ADD COLUMN "skill_id" integer;
  ALTER TABLE "aula" ADD COLUMN "skill_id" integer;
  ALTER TABLE "projeto" ADD CONSTRAINT "projeto_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "artigo" ADD CONSTRAINT "artigo_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "modelo3d" ADD CONSTRAINT "modelo3d_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "aula" ADD CONSTRAINT "aula_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "projeto_skill_idx" ON "projeto" USING btree ("skill_id");
  CREATE INDEX "artigo_skill_idx" ON "artigo" USING btree ("skill_id");
  CREATE INDEX "modelo3d_skill_idx" ON "modelo3d" USING btree ("skill_id");
  CREATE INDEX "aula_skill_idx" ON "aula" USING btree ("skill_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projeto" DROP CONSTRAINT "projeto_skill_id_skill_id_fk";
  
  ALTER TABLE "artigo" DROP CONSTRAINT "artigo_skill_id_skill_id_fk";
  
  ALTER TABLE "modelo3d" DROP CONSTRAINT "modelo3d_skill_id_skill_id_fk";
  
  ALTER TABLE "aula" DROP CONSTRAINT "aula_skill_id_skill_id_fk";
  
  DROP INDEX "projeto_skill_idx";
  DROP INDEX "artigo_skill_idx";
  DROP INDEX "modelo3d_skill_idx";
  DROP INDEX "aula_skill_idx";
  ALTER TABLE "projeto" DROP COLUMN "skill_id";
  ALTER TABLE "artigo" DROP COLUMN "skill_id";
  ALTER TABLE "modelo3d" DROP COLUMN "skill_id";
  ALTER TABLE "aula" DROP COLUMN "skill_id";`)
}
