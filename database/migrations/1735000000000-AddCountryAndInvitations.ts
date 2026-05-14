import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 — País en empresa + sistema de invitaciones.
 *
 * - companies.country (varchar(2) ISO-3166-1 alpha-2, nullable)
 * - companies.tax_label (varchar(20), default 'IVA')
 * - tabla `invitations` para que el admin invite por email a nuevos miembros.
 *   El token plano nunca se guarda; solo su SHA-256.
 */
export class AddCountryAndInvitations1735000000000 implements MigrationInterface {
  name = 'AddCountryAndInvitations1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── companies: country + tax_label ─────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN IF NOT EXISTS "country" character varying(2),
        ADD COLUMN IF NOT EXISTS "tax_label" character varying(20) NOT NULL DEFAULT 'IVA'
    `);

    // ── invitations ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "invitations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "email" character varying(200) NOT NULL,
        "role" "public"."user_role_enum" NOT NULL,
        "custom_role_id" uuid,
        "token_hash" character varying(64) NOT NULL,
        "invited_by_user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "accepted_at" TIMESTAMP,
        "revoked_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invitations_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_invitations_custom_role"
          FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_invitations_invited_by"
          FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invitations_token_hash" ON "invitations" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_invitations_company_email" ON "invitations" ("company_id","email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invitations_company_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invitations_token_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "tax_label",
        DROP COLUMN IF EXISTS "country"
    `);
  }
}
