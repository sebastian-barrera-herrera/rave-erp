import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte los `UNIQUE` globales sobre los números de documento
 * (`sales.invoice_number`, `quotations.quotation_number`,
 * `support_tickets.ticket_number`) en `UNIQUE` compuestos
 * `(company_id, número)`.
 *
 * Antes de esta migración, una nueva empresa que intentaba registrar
 * su primera venta fallaba con
 *   `duplicate key value violates unique constraint "UQ_..."`
 * porque la primera factura `INV-YYYY-000001` ya existía en otra empresa.
 *
 * También normaliza cualquier `trial_ends_at` > 90 días desde el
 * `created_at`: lo recorta a 3 días desde hoy. Esto arregla las empresas
 * que se crearon con un `STRIPE_TRIAL_DAYS` antiguo (p. ej. 120) y que
 * ahora muestran "120 días restantes" cuando el trial real son 3 días.
 */
export class FixPerCompanyUniqueNumbers1770000000000 implements MigrationInterface {
  name = 'FixPerCompanyUniqueNumbers1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Drop unique global por columna (cualquiera sea el hash que TypeORM
    //       le haya asignado) y reemplazarlo por compuesto (company_id, número).
    const targets: Array<{ table: string; column: string; constraint: string }> = [
      { table: 'sales', column: 'invoice_number', constraint: 'UQ_sales_company_invoice' },
      { table: 'quotations', column: 'quotation_number', constraint: 'UQ_quotations_company_number' },
      { table: 'support_tickets', column: 'ticket_number', constraint: 'UQ_support_tickets_company_number' },
    ];

    for (const { table, column, constraint } of targets) {
      // Drop cualquier unique global que aplique solo a esa columna.
      await queryRunner.query(`
        DO $$
        DECLARE
          cn text;
        BEGIN
          FOR cn IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
            WHERE rel.relname = '${table}'
              AND con.contype = 'u'
              AND att.attname = '${column}'
              AND array_length(con.conkey, 1) = 1
          LOOP
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', '${table}', cn);
          END LOOP;
        END $$;
      `);

      // Crear el compuesto (idempotente — si ya existe lo dejamos).
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
          ) THEN
            ALTER TABLE "${table}"
              ADD CONSTRAINT "${constraint}" UNIQUE ("company_id", "${column}");
          END IF;
        END $$;
      `);
    }

    // ── 2. Normalizar trials demasiado largos (heredados de configuraciones
    //       previas con STRIPE_TRIAL_DAYS=120 u otro valor alto).
    await queryRunner.query(`
      UPDATE "companies"
      SET "trial_ends_at" = NOW() + INTERVAL '3 days',
          "subscription_ends_at" = CASE
            WHEN "subscription_ends_at" IS NULL OR "subscription_ends_at" > NOW() + INTERVAL '90 days'
              THEN NOW() + INTERVAL '3 days'
            ELSE "subscription_ends_at"
          END
      WHERE "subscription_status" = 'TRIAL'
        AND "trial_ends_at" IS NOT NULL
        AND "trial_ends_at" > NOW() + INTERVAL '30 days';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const targets: Array<{ table: string; column: string; constraint: string }> = [
      { table: 'sales', column: 'invoice_number', constraint: 'UQ_sales_company_invoice' },
      { table: 'quotations', column: 'quotation_number', constraint: 'UQ_quotations_company_number' },
      { table: 'support_tickets', column: 'ticket_number', constraint: 'UQ_support_tickets_company_number' },
    ];

    for (const { table, column, constraint } of targets) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`);
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
            WHERE rel.relname = '${table}'
              AND con.contype = 'u'
              AND att.attname = '${column}'
              AND array_length(con.conkey, 1) = 1
          ) THEN
            ALTER TABLE "${table}" ADD CONSTRAINT "UQ_${table}_${column}" UNIQUE ("${column}");
          END IF;
        END $$;
      `);
    }
  }
}
