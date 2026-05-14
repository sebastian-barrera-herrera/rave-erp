import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4 — Planeador diario (DailyPlan + PlanTask + PlanVisit).
 */
export class AddPlanner1745000000000 implements MigrationInterface {
  name = 'AddPlanner1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_task_priority_enum') THEN
          CREATE TYPE "public"."plan_task_priority_enum" AS ENUM ('LOW','MEDIUM','HIGH');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_visit_status_enum') THEN
          CREATE TYPE "public"."plan_visit_status_enum" AS ENUM ('PENDING','VISITED','SKIPPED');
        END IF;
      END $$;
    `);

    // ── DAILY PLANS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "daily_plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "plan_date" date NOT NULL,
        "notes" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_daily_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_daily_plans_user_date" UNIQUE ("user_id","plan_date"),
        CONSTRAINT "FK_daily_plans_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_daily_plans_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_daily_plans_company_date" ON "daily_plans" ("company_id","plan_date")
    `);

    // ── TASKS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "plan_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "plan_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" character varying,
        "priority" "public"."plan_task_priority_enum" NOT NULL DEFAULT 'MEDIUM',
        "is_done" boolean NOT NULL DEFAULT false,
        "done_at" TIMESTAMP,
        "order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_tasks_plan"
          FOREIGN KEY ("plan_id") REFERENCES "daily_plans"("id") ON DELETE CASCADE
      )
    `);

    // ── VISITS ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "plan_visits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "plan_id" uuid NOT NULL,
        "customer_id" uuid,
        "customer_name" character varying(200) NOT NULL,
        "address" character varying,
        "scheduled_time" time,
        "status" "public"."plan_visit_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" character varying,
        "order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plan_visits" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plan_visits_plan"
          FOREIGN KEY ("plan_id") REFERENCES "daily_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_plan_visits_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_visits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_tasks"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_daily_plans_company_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."plan_visit_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."plan_task_priority_enum"`);
  }
}
