import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5 — Identidad visual persistida y documentos por miembro del equipo.
 *
 * - companies: primary_color, accent_color, display_name, banner_url, show_banner
 * - user_documents: archivos cargados por (o sobre) un miembro del equipo
 *   (incapacidades, afiliaciones, certificaciones, etc.).
 */
export class AddBrandingAndUserDocuments1750000000000 implements MigrationInterface {
  name = 'AddBrandingAndUserDocuments1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── BRANDING ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN IF NOT EXISTS "primary_color" varchar(30),
        ADD COLUMN IF NOT EXISTS "accent_color"  varchar(30),
        ADD COLUMN IF NOT EXISTS "display_name"  varchar(200),
        ADD COLUMN IF NOT EXISTS "banner_url"    varchar,
        ADD COLUMN IF NOT EXISTS "show_banner"   boolean NOT NULL DEFAULT false
    `);

    // ── USER DOCUMENTS ─────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_document_type_enum') THEN
          CREATE TYPE "public"."user_document_type_enum" AS ENUM (
            'MEDICAL_LEAVE',
            'AFFILIATION',
            'ID',
            'CONTRACT',
            'TRAINING',
            'OTHER'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "uploaded_by_id" uuid,
        "type" "public"."user_document_type_enum" NOT NULL DEFAULT 'OTHER',
        "title" character varying(200) NOT NULL,
        "description" character varying,
        "file_name" character varying(255) NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "size" integer NOT NULL,
        "data" bytea NOT NULL,
        "issued_at" date,
        "expires_at" date,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_user_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_documents_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_documents_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_documents_uploader"
          FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_documents_user" ON "user_documents" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_documents_company" ON "user_documents" ("company_id","created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_documents_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_documents_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_documents"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_document_type_enum"`);

    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "show_banner",
        DROP COLUMN IF EXISTS "banner_url",
        DROP COLUMN IF EXISTS "display_name",
        DROP COLUMN IF EXISTS "accent_color",
        DROP COLUMN IF EXISTS "primary_color"
    `);
  }
}
