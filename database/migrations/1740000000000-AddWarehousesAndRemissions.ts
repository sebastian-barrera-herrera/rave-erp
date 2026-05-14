import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3 — Bodegas, remisiones, anticipo en venta y bodega en venta/inventory.
 *
 * Pasos:
 *   1. Extender enum movement_type con TRANSFER_IN/TRANSFER_OUT.
 *   2. Crear enum remission_status.
 *   3. Crear tabla `warehouses`.
 *   4. Crear tabla `warehouse_stocks`.
 *   5. Crear tabla `remissions` y `remission_items`.
 *   6. Añadir columnas: inventory_movements.warehouse_id, sales.warehouse_id,
 *      sales.down_payment.
 *   7. Seed: una "Bodega Principal" por empresa + migrar product.stock al
 *      registro warehouse_stocks de esa bodega principal.
 */
export class AddWarehousesAndRemissions1740000000000 implements MigrationInterface {
  name = 'AddWarehousesAndRemissions1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── ENUMS ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TYPE "public"."movement_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER_IN'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."movement_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'remission_status_enum') THEN
          CREATE TYPE "public"."remission_status_enum" AS ENUM ('DRAFT','ISSUED','CANCELED');
        END IF;
      END $$;
    `);

    // ── WAREHOUSES ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "warehouses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "code" character varying(30) NOT NULL,
        "address" character varying,
        "notes" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_sellable" boolean NOT NULL DEFAULT true,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouses_company_code" UNIQUE ("company_id","code"),
        CONSTRAINT "FK_warehouses_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);

    // ── WAREHOUSE_STOCKS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "warehouse_stocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "warehouse_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "min_stock" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_warehouse_stocks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_warehouse_stocks_wh_product" UNIQUE ("warehouse_id","product_id"),
        CONSTRAINT "FK_warehouse_stocks_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_warehouse_stocks_warehouse"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_warehouse_stocks_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_warehouse_stocks_company" ON "warehouse_stocks" ("company_id")
    `);

    // ── REMISSIONS ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "remissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "company_id" uuid NOT NULL,
        "remission_number" character varying(50) NOT NULL,
        "customer_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "warehouse_id" uuid,
        "status" "public"."remission_status_enum" NOT NULL DEFAULT 'ISSUED',
        "description" character varying,
        "notes" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_remissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_remissions_company_number" UNIQUE ("company_id","remission_number"),
        CONSTRAINT "FK_remissions_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_remissions_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
        CONSTRAINT "FK_remissions_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_remissions_warehouse"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "remission_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "remission_id" uuid NOT NULL,
        "product_id" uuid,
        "product_name" character varying(200) NOT NULL,
        "description" character varying,
        "quantity" integer NOT NULL,
        "unit" character varying(50) NOT NULL DEFAULT 'unidad',
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_remission_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_remission_items_remission"
          FOREIGN KEY ("remission_id") REFERENCES "remissions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_remission_items_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL
      )
    `);

    // ── COLUMNAS NUEVAS EN TABLAS EXISTENTES ───────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
        ADD COLUMN IF NOT EXISTS "warehouse_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_movements"
        ADD CONSTRAINT "FK_inventory_movements_warehouse"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
        ADD COLUMN IF NOT EXISTS "warehouse_id" uuid,
        ADD COLUMN IF NOT EXISTS "down_payment" numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
        ADD CONSTRAINT "FK_sales_warehouse"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL
    `);

    // ── SEED: Bodega Principal por empresa + migrar product.stock ──────────
    // Una "Bodega Principal" (PRINCIPAL, is_default=true) por cada company.
    await queryRunner.query(`
      INSERT INTO "warehouses" ("company_id","name","code","is_active","is_sellable","is_default")
      SELECT c."id", 'Bodega Principal', 'PRINCIPAL', true, true, true
      FROM "companies" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "warehouses" w WHERE w."company_id" = c."id" AND w."is_default" = true
      )
    `);

    // Para cada producto que no tenga registro en warehouse_stocks, creamos
    // una entrada en la bodega principal de su empresa con su stock actual.
    await queryRunner.query(`
      INSERT INTO "warehouse_stocks" ("company_id","warehouse_id","product_id","stock","min_stock")
      SELECT p."company_id",
             w."id",
             p."id",
             COALESCE(p."stock",0),
             COALESCE(p."min_stock",0)
      FROM "products" p
      JOIN "warehouses" w ON w."company_id" = p."company_id" AND w."is_default" = true
      WHERE NOT EXISTS (
        SELECT 1 FROM "warehouse_stocks" ws WHERE ws."product_id" = p."id"
      )
    `);

    // Marcamos las ventas y movimientos existentes contra la bodega principal
    // (mejor que dejarlos NULL; mantiene consistencia en reportes).
    await queryRunner.query(`
      UPDATE "sales" s
      SET "warehouse_id" = w."id"
      FROM "warehouses" w
      WHERE w."company_id" = s."company_id" AND w."is_default" = true
        AND s."warehouse_id" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "inventory_movements" m
      SET "warehouse_id" = w."id"
      FROM "warehouses" w
      WHERE w."company_id" = m."company_id" AND w."is_default" = true
        AND m."warehouse_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "FK_sales_warehouse"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "warehouse_id"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "down_payment"`);

    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "FK_inventory_movements_warehouse"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "warehouse_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "remission_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "remissions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_warehouse_stocks_company"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouse_stocks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouses"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."remission_status_enum"`);
    // No revertimos los valores TRANSFER_IN/OUT del enum movement_type_enum;
    // Postgres no soporta DROP VALUE de un enum sin recrearlo.
  }
}
