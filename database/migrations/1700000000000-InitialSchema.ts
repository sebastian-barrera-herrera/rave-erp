import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_status_enum" AS ENUM ('TRIAL','ACTIVE','PAST_DUE','CANCELED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."subscription_plan_enum" AS ENUM ('MONTHLY','QUARTERLY','YEARLY')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."user_role_enum" AS ENUM ('ADMIN','MANAGER','SELLER','CASHIER','EMPLOYEE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."sale_type_enum" AS ENUM ('CASH','CREDIT')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."sale_status_enum" AS ENUM ('PENDING','COMPLETED','CANCELED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."debt_status_enum" AS ENUM ('PENDING','PARTIAL','PAID','OVERDUE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."payment_method_enum" AS ENUM ('CASH','CARD','TRANSFER','CHECK','OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."movement_type_enum" AS ENUM ('IN','OUT','ADJUSTMENT')
    `);

    // ── COMPANIES ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "email" character varying(200) NOT NULL,
        "currency" character varying(20) NOT NULL DEFAULT 'COP',
        "tax_rate" numeric(5,4) NOT NULL DEFAULT 0.19,
        "address" character varying,
        "phone" character varying,
        "logo_url" character varying,
        "website" character varying,
        "tax_id" character varying,
        "stripe_customer_id" character varying,
        "stripe_subscription_id" character varying,
        "subscription_status" "public"."subscription_status_enum" NOT NULL DEFAULT 'TRIAL',
        "subscription_plan" "public"."subscription_plan_enum",
        "subscription_ends_at" TIMESTAMP,
        "trial_ends_at" TIMESTAMP,
        "next_billing_date" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_companies_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_companies_email" UNIQUE ("email"),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )
    `);

    // ── CUSTOM ROLES ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "custom_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "description" character varying,
        "permissions" text NOT NULL DEFAULT '',
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_custom_roles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_custom_roles_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── USERS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "email" character varying(200) NOT NULL,
        "password_hash" character varying NOT NULL,
        "role" "public"."user_role_enum" NOT NULL DEFAULT 'EMPLOYEE',
        "custom_role_id" uuid,
        "custom_permissions" text NOT NULL DEFAULT '',
        "avatar_url" character varying,
        "phone" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP,
        "refresh_token_hash" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_users_custom_role" FOREIGN KEY ("custom_role_id")
          REFERENCES "custom_roles"("id") ON DELETE SET NULL
      )
    `);

    // ── CUSTOMERS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "email" character varying(200),
        "phone" character varying(30),
        "address" character varying,
        "document_number" character varying(50),
        "document_type" character varying(20),
        "notes" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── PRODUCTS ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "sku" character varying(100) NOT NULL,
        "description" character varying,
        "category" character varying(100),
        "brand" character varying(100),
        "price" numeric(14,2) NOT NULL,
        "cost" numeric(14,2) NOT NULL DEFAULT 0,
        "stock" integer NOT NULL DEFAULT 0,
        "min_stock" integer NOT NULL DEFAULT 5,
        "unit" character varying(50) NOT NULL DEFAULT 'unidad',
        "barcode" character varying,
        "image_url" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "track_stock" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── SALES ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "invoice_number" character varying(50) NOT NULL,
        "type" "public"."sale_type_enum" NOT NULL,
        "status" "public"."sale_status_enum" NOT NULL DEFAULT 'COMPLETED',
        "subtotal" numeric(14,2) NOT NULL,
        "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "total" numeric(14,2) NOT NULL,
        "notes" character varying,
        "due_date" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_sales_invoice_number" UNIQUE ("invoice_number"),
        CONSTRAINT "PK_sales" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id"),
        CONSTRAINT "FK_sales_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    // ── SALE ITEMS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "sale_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "product_name" character varying(200) NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" numeric(14,2) NOT NULL,
        "discount" numeric(14,2) NOT NULL DEFAULT 0,
        "subtotal" numeric(14,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sale_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_items_sale" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_items_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id")
      )
    `);

    // ── INVENTORY MOVEMENTS ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "sale_id" uuid,
        "type" "public"."movement_type_enum" NOT NULL,
        "quantity" integer NOT NULL,
        "stock_before" integer NOT NULL,
        "stock_after" integer NOT NULL,
        "reason" character varying,
        "reference" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inv_movements_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inv_movements_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id"),
        CONSTRAINT "FK_inv_movements_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_inv_movements_sale" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id") ON DELETE SET NULL
      )
    `);

    // ── DEBTS ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "debts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "total_amount" numeric(14,2) NOT NULL,
        "paid_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "remaining_amount" numeric(14,2) NOT NULL,
        "status" "public"."debt_status_enum" NOT NULL DEFAULT 'PENDING',
        "due_date" TIMESTAMP,
        "notes" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_debts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_debts_sale" UNIQUE ("sale_id"),
        CONSTRAINT "FK_debts_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_debts_sale" FOREIGN KEY ("sale_id")
          REFERENCES "sales"("id"),
        CONSTRAINT "FK_debts_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id")
      )
    `);

    // ── PAYMENTS ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "debt_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "method" "public"."payment_method_enum" NOT NULL DEFAULT 'CASH',
        "reference" character varying(100),
        "notes" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_debt" FOREIGN KEY ("debt_id")
          REFERENCES "debts"("id"),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id")
      )
    `);

    // ── INDEXES ───────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE INDEX "IDX_users_company" ON "users"("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users"("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_company" ON "products"("company_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_sku" ON "products"("company_id","sku")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_company_date" ON "sales"("company_id","created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_sales_customer" ON "sales"("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_debts_company_status" ON "debts"("company_id","status")`);
    await queryRunner.query(`CREATE INDEX "IDX_debts_customer" ON "debts"("customer_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_inv_product" ON "inventory_movements"("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_debt" ON "payments"("debt_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_companies_stripe" ON "companies"("stripe_customer_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "debts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."movement_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."debt_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sale_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sale_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."user_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."subscription_status_enum"`);
  }
}
