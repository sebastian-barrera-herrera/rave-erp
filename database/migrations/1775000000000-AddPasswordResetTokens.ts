import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columnas para el flujo de "Olvidé mi contraseña":
 *   - password_reset_token_hash: SHA-256 del token plano enviado por email.
 *   - password_reset_expires_at: fecha en la que el token deja de ser válido.
 *
 * Solo se guarda el hash para que un dump de DB no comprometa los tokens
 * activos. El plano viaja una sola vez (en el correo) y nunca se persiste.
 */
export class AddPasswordResetTokens1775000000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "password_reset_token_hash" varchar NULL,
      ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp NULL
    `);

    // Índice para la búsqueda por hash en /auth/reset-password.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_password_reset_token_hash"
        ON "users" ("password_reset_token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_password_reset_token_hash"`);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "password_reset_token_hash",
      DROP COLUMN IF EXISTS "password_reset_expires_at"
    `);
  }
}
