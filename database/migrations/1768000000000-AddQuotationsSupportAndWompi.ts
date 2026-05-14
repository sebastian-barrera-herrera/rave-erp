import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas que originalmente se generaban con `synchronize: true`
 * y que ninguna migración previa cubre: `quotations`, `quotation_items`,
 * `support_tickets`, `ticket_messages` y `wompi_transactions`. Sin esto,
 * la migración 1770 (UNIQUE compuestos por empresa) falla porque
 * `quotations` y `support_tickets` no existen.
 */
export class AddQuotationsSupportAndWompi1768000000000 implements MigrationInterface {
  name = 'AddQuotationsSupportAndWompi1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."quotations_status_enum" AS ENUM ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_type_enum" AS ENUM ('CLAIM','COMPLAINT','SUGGESTION','QUESTION','OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_status_enum" AS ENUM ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."support_tickets_priority_enum" AS ENUM ('LOW','MEDIUM','HIGH','URGENT')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."wompi_transactions_status_enum" AS ENUM ('PENDING','APPROVED','DECLINED','VOIDED','ERROR')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."wompi_transactions_plan_enum" AS ENUM ('MONTHLY','QUARTERLY','YEARLY')
    `);

    // ── QUOTATIONS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "quotations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "quotation_number" character varying(50) NOT NULL,
        "status" "public"."quotations_status_enum" NOT NULL DEFAULT 'DRAFT',
        "subtotal" numeric(14,2) NOT NULL,
        "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "total" numeric(14,2) NOT NULL,
        "notes" character varying,
        "terms" character varying,
        "valid_until" TIMESTAMP,
        "sent_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_quotations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quotations_company_number" UNIQUE ("company_id", "quotation_number"),
        CONSTRAINT "FK_quotations_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_quotations_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id"),
        CONSTRAINT "FK_quotations_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    // ── QUOTATION ITEMS ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "quotation_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "quotation_id" uuid NOT NULL,
        "product_id" uuid,
        "description" character varying(300) NOT NULL,
        "unit" character varying,
        "quantity" integer NOT NULL,
        "unit_price" numeric(14,2) NOT NULL,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "subtotal" numeric(14,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotation_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quotation_items_quotation" FOREIGN KEY ("quotation_id")
          REFERENCES "quotations"("id") ON DELETE CASCADE
      )
    `);

    // ── SUPPORT TICKETS ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "ticket_number" character varying(50) NOT NULL,
        "type" "public"."support_tickets_type_enum" NOT NULL,
        "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'OPEN',
        "priority" "public"."support_tickets_priority_enum" NOT NULL DEFAULT 'MEDIUM',
        "subject" character varying(300) NOT NULL,
        "resolved_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_support_tickets_company_number" UNIQUE ("company_id", "ticket_number"),
        CONSTRAINT "FK_support_tickets_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_support_tickets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    // ── TICKET MESSAGES ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "ticket_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticket_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "message" text NOT NULL,
        "is_staff_reply" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ticket_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ticket_messages_ticket" FOREIGN KEY ("ticket_id")
          REFERENCES "support_tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_messages_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    // ── WOMPI TRANSACTIONS ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "wompi_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "reference" character varying(200) NOT NULL,
        "wompi_transaction_id" character varying(100),
        "plan" "public"."wompi_transactions_plan_enum",
        "amount_in_cents" bigint NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'COP',
        "customer_email" character varying(200) NOT NULL,
        "status" "public"."wompi_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
        "payment_method_type" character varying(50),
        "checkout_url" text,
        "raw_payload" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wompi_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wompi_transactions_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_wompi_transactions_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_wompi_transactions_company_ref" ON "wompi_transactions"("company_id","reference")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quotations_company" ON "quotations"("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_company_status" ON "support_tickets"("company_id","status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wompi_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotation_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."wompi_transactions_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."wompi_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."support_tickets_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."quotations_status_enum"`);
  }
}
