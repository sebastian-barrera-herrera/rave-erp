import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `font_size` y `font_family` a `companies` para persistir las
 * preferencias tipográficas de la empresa en backend. Antes vivían solo en
 * localStorage, así que el usuario perdía su configuración al cambiar de
 * navegador / cerrar sesión.
 *
 * Migración aditiva — columnas nullable, sin valor por defecto en DB. El
 * frontend cae a 'lg'/'system' si vienen NULL.
 */
export class AddCompanyTypography1795000000000 implements MigrationInterface {
  name = 'AddCompanyTypography1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
      ADD COLUMN IF NOT EXISTS "font_size" varchar(10) NULL,
      ADD COLUMN IF NOT EXISTS "font_family" varchar(30) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
      DROP COLUMN IF EXISTS "font_family",
      DROP COLUMN IF EXISTS "font_size"
    `);
  }
}
