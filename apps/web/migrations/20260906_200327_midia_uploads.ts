import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "midia_imagem" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_miniatura_url" varchar,
  	"sizes_miniatura_width" numeric,
  	"sizes_miniatura_height" numeric,
  	"sizes_miniatura_mime_type" varchar,
  	"sizes_miniatura_filesize" numeric,
  	"sizes_miniatura_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "midia_modelo3d" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "midia_documento" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "midia_imagem_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "midia_modelo3d_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "midia_documento_id" integer;
  ALTER TABLE "midia_imagem" ADD CONSTRAINT "midia_imagem_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "midia_modelo3d" ADD CONSTRAINT "midia_modelo3d_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "midia_documento" ADD CONSTRAINT "midia_documento_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "midia_imagem_tenant_idx" ON "midia_imagem" USING btree ("tenant_id");
  CREATE INDEX "midia_imagem_updated_at_idx" ON "midia_imagem" USING btree ("updated_at");
  CREATE INDEX "midia_imagem_created_at_idx" ON "midia_imagem" USING btree ("created_at");
  CREATE UNIQUE INDEX "midia_imagem_filename_idx" ON "midia_imagem" USING btree ("filename");
  CREATE INDEX "midia_imagem_sizes_miniatura_sizes_miniatura_filename_idx" ON "midia_imagem" USING btree ("sizes_miniatura_filename");
  CREATE INDEX "midia_imagem_sizes_card_sizes_card_filename_idx" ON "midia_imagem" USING btree ("sizes_card_filename");
  CREATE INDEX "midia_modelo3d_tenant_idx" ON "midia_modelo3d" USING btree ("tenant_id");
  CREATE INDEX "midia_modelo3d_updated_at_idx" ON "midia_modelo3d" USING btree ("updated_at");
  CREATE INDEX "midia_modelo3d_created_at_idx" ON "midia_modelo3d" USING btree ("created_at");
  CREATE UNIQUE INDEX "midia_modelo3d_filename_idx" ON "midia_modelo3d" USING btree ("filename");
  CREATE INDEX "midia_documento_tenant_idx" ON "midia_documento" USING btree ("tenant_id");
  CREATE INDEX "midia_documento_updated_at_idx" ON "midia_documento" USING btree ("updated_at");
  CREATE INDEX "midia_documento_created_at_idx" ON "midia_documento" USING btree ("created_at");
  CREATE UNIQUE INDEX "midia_documento_filename_idx" ON "midia_documento" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_midia_imagem_fk" FOREIGN KEY ("midia_imagem_id") REFERENCES "public"."midia_imagem"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_midia_modelo3d_fk" FOREIGN KEY ("midia_modelo3d_id") REFERENCES "public"."midia_modelo3d"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_midia_documento_fk" FOREIGN KEY ("midia_documento_id") REFERENCES "public"."midia_documento"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_midia_imagem_id_idx" ON "payload_locked_documents_rels" USING btree ("midia_imagem_id");
  CREATE INDEX "payload_locked_documents_rels_midia_modelo3d_id_idx" ON "payload_locked_documents_rels" USING btree ("midia_modelo3d_id");
  CREATE INDEX "payload_locked_documents_rels_midia_documento_id_idx" ON "payload_locked_documents_rels" USING btree ("midia_documento_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "midia_imagem" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "midia_modelo3d" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "midia_documento" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "midia_imagem" CASCADE;
  DROP TABLE "midia_modelo3d" CASCADE;
  DROP TABLE "midia_documento" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_midia_imagem_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_midia_modelo3d_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_midia_documento_fk";
  
  DROP INDEX "payload_locked_documents_rels_midia_imagem_id_idx";
  DROP INDEX "payload_locked_documents_rels_midia_modelo3d_id_idx";
  DROP INDEX "payload_locked_documents_rels_midia_documento_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "midia_imagem_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "midia_modelo3d_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "midia_documento_id";`)
}
