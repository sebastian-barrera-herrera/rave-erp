import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1. Convierte `payments.method` de enum nativo PG a varchar(20) para
 *    permitir agregar métodos nuevos (NEQUI, DAVIPLATA) sin correr un
 *    ALTER TYPE costoso cada vez. La validación se mueve a class-validator.
 * 2. Agrega `payment_method` y `payment_reference` en `sales` para registrar
 *    cómo se cobró una venta de contado (antes solo se guardaba en
 *    `down_payment_method`, que no tenía sentido para ventas CASH sin
 *    anticipo) y un número de referencia para conciliación.
 *
 * Aditiva, idempotente, sin pérdida de datos: los valores existentes del
 * enum (CASH/CARD/TRANSFER/CHECK/OTHER) se conservan como texto.
 */
export class AddPaymentMethodFieldsAndExtendEnum1796000000000
  implements MigrationInterface
{
  name = 'AddPaymentMethodFieldsAndExtendEnum1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. payments.method enum → varchar ───────────────────────────────────
    // Drop default antes del USING para que el cast no choque con el default
    // tipado al enum. Luego le devolvemos un default coherente como texto.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'payments'
            AND column_name = 'method'
            AND udt_name LIKE '%enum%'
        ) THEN
          ALTER TABLE "payments" ALTER COLUMN "method" DROP DEFAULT;
          ALTER TABLE "payments" ALTER COLUMN "method" TYPE varchar(20) USING "method"::text;
          ALTER TABLE "payments" ALTER COLUMN "method" SET DEFAULT 'CASH';
        END IF;
      END $$;
    `);

    // Si quedó algún tipo huérfano del enum viejo (TypeORM nombra
    // `payments_method_enum`), lo borramos para no dejar basura.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'payments_method_enum'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE udt_name = 'payments_method_enum'
        ) THEN
          DROP TYPE "payments_method_enum";
        END IF;
      END $$;
    `);

    // ── 2. sales.payment_method + sales.payment_reference ──────────────────
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "payment_method" varchar(20) NULL,
      ADD COLUMN IF NOT EXISTS "payment_reference" varchar(100) NULL
    `);

    // Backfill: ventas de contado existentes asumimos CASH (era el default
    // implícito antes de tener la columna). Las de crédito quedan NULL.
    await queryRunner.query(`
      UPDATE "sales"
      SET "payment_method" = 'CASH'
      WHERE "payment_method" IS NULL
        AND "type" = 'CASH'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      DROP COLUMN IF EXISTS "payment_reference",
      DROP COLUMN IF EXISTS "payment_method"
    `);
    // Reconstrucción exacta del enum nativo no es 1:1 (los nuevos valores
    // NEQUI/DAVIPLATA fallarían). En down dejamos varchar — la operación
    // sigue siendo válida; el "down" rara vez se ejecuta en prod.
  }
}
