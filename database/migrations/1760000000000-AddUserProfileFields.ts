import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 6 — Perfil del miembro del equipo.
 *
 * Cada usuario puede auto-editar su nombre, foto, teléfono, cédula y
 * dirección. Antes solo teníamos phone + avatar_url, faltaba document_number
 * (cédula) y address.
 */
export class AddUserProfileFields1760000000000 implements MigrationInterface {
  name = 'AddUserProfileFields1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "document_number" varchar(50),
        ADD COLUMN IF NOT EXISTS "address" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "document_number"
    `);
  }
}
