import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración consolidada para tres features pedidas por usuarios:
 *
 *  1. Suppliers unificados con customers — agregamos `kind` a la tabla
 *     `customers` para que un mismo contacto pueda ser cliente, proveedor o
 *     ambos. Productos pueden referenciar un proveedor (`products.supplier_id`).
 *  2. Returns (devoluciones de venta + averías de inventario) — tabla nueva
 *     `returns` con items asociados y movimientos derivados.
 *  3. Services (servicios técnicos) — tabla nueva `services` con tipo,
 *     trabajador, costo, tiempo, cliente.
 *
 * Diseño aditivo: todo es opcional / con DEFAULT seguro para no romper
 * registros existentes. Si la migración falla a la mitad, los rollbacks
 * eliminan exactamente lo que crearon.
 */
export class AddSuppliersReturnsServices1790000000000 implements MigrationInterface {
  name = 'AddSuppliersReturnsServices1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Suppliers ─────────────────────────────────────────────────────────
    // `kind`: CUSTOMER | SUPPLIER | BOTH. Default CUSTOMER conserva el
    // comportamiento histórico. Sin enum nativo: usamos varchar para evitar
    // un ALTER TYPE costoso cuando agreguemos valores nuevos.
    await queryRunner.query(`
      ALTER TABLE "customers"
      ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'CUSTOMER'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_kind"
      ON "customers" ("company_id", "kind")
    `);

    // Producto puede tener un proveedor opcional (un mismo proveedor surte
    // varios productos). `ON DELETE SET NULL` para no borrar productos si
    // el proveedor desaparece.
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "supplier_id" uuid NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_products_supplier'
        ) THEN
          ALTER TABLE "products"
          ADD CONSTRAINT "FK_products_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "customers"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ── 2. Returns (devoluciones / averías) ──────────────────────────────────
    // type: SALE_RETURN (afecta venta + repone stock) | DAMAGE (solo descuenta
    // stock sin venta asociada). status: COMPLETED por defecto; futuro
    // podemos agregar PENDING/REJECTED si hace falta workflow.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "returns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'COMPLETED',
        "sale_id" uuid NULL,
        "customer_id" uuid NULL,
        "warehouse_id" uuid NULL,
        "user_id" uuid NULL,
        "reason" varchar(300) NULL,
        "notes" text NULL,
        "total_amount" numeric(14,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp NULL,
        CONSTRAINT "FK_returns_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_returns_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_returns_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_returns_warehouse" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_returns_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_returns_company_created"
      ON "returns" ("company_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "return_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "return_id" uuid NOT NULL,
        "product_id" uuid NULL,
        "product_name" varchar(200) NOT NULL,
        "quantity" int NOT NULL,
        "unit_price" numeric(14,2) NOT NULL DEFAULT 0,
        "subtotal" numeric(14,2) NOT NULL DEFAULT 0,
        "reason" varchar(200) NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_return_items_return" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_return_items_return"
      ON "return_items" ("return_id")
    `);

    // ── 3. Services (servicios técnicos) ─────────────────────────────────────
    // worker_id puede ser un user (técnico del sistema) o, si no está
    // registrado, dejamos worker_name como texto libre. cost = lo que se cobra
    // al cliente. duration_minutes para reportes de productividad.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "services" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "company_id" uuid NOT NULL,
        "service_number" varchar(50) NOT NULL,
        "service_type" varchar(120) NOT NULL,
        "category" varchar(80) NULL,
        "status" varchar(20) NOT NULL DEFAULT 'COMPLETED',
        "customer_id" uuid NULL,
        "worker_id" uuid NULL,
        "worker_name" varchar(150) NULL,
        "description" text NULL,
        "cost" numeric(14,2) NOT NULL DEFAULT 0,
        "duration_minutes" int NOT NULL DEFAULT 0,
        "scheduled_at" timestamp NULL,
        "completed_at" timestamp NULL,
        "notes" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp NULL,
        CONSTRAINT "FK_services_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_services_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_services_worker" FOREIGN KEY ("worker_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_services_company_number" UNIQUE ("company_id", "service_number")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_services_company_created"
      ON "services" ("company_id", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_services_worker"
      ON "services" ("worker_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "services"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "returns"`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_products_supplier'
        ) THEN
          ALTER TABLE "products" DROP CONSTRAINT "FK_products_supplier";
        END IF;
      END $$;
    `);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "supplier_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_kind"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "kind"`);
  }
}
