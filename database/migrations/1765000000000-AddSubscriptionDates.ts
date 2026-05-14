import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 7 — Fechas de inicio/cancelación de la suscripción.
 *
 *  - subscription_started_at:   cuándo empezó el plan vigente (cuando se aprobó el pago).
 *  - subscription_cancel_at:    si el usuario canceló, hasta cuándo conserva acceso.
 */
export class AddSubscriptionDates1765000000000 implements MigrationInterface {
  name = 'AddSubscriptionDates1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN IF NOT EXISTS "subscription_started_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "subscription_cancel_at"  TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN IF EXISTS "subscription_cancel_at",
        DROP COLUMN IF EXISTS "subscription_started_at"
    `);
  }
}
