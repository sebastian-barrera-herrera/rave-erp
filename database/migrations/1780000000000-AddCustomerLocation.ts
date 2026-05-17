import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `state` (departamento) y `city` (municipio) a clientes.
 * Útil para reportes regionales y para certificados/facturas que requieren
 * la ubicación del cliente.
 */
export class AddCustomerLocation1780000000000 implements MigrationInterface {
  name = 'AddCustomerLocation1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "state" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "city" varchar(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      DROP COLUMN IF EXISTS "city",
      DROP COLUMN IF EXISTS "state"
    `);
  }
}
