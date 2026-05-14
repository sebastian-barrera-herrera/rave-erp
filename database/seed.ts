/**
 * Seed script — creates a demo company with admin user, sample products,
 * a customer, and a sample sale.
 *
 * Usage:
 *   npx ts-node database/seed.ts
 *
 * Requires the DB to be running and migrations to have been applied.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'erp_saas',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'secret',
  synchronize: false,
  logging: false,
  entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
});

async function seed() {
  await AppDataSource.initialize();
  console.log('📦 Starting seed...');

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  // ── Company ──────────────────────────────────────────────────────────────
  const company = await AppDataSource.query(`
    INSERT INTO companies (name, slug, email, currency, tax_rate, address, phone, subscription_status, trial_ends_at, subscription_ends_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `, [
    'Demo Ferretería El Clavo',
    'demo-ferreteria-el-clavo-' + Date.now(),
    'demo@ferreteria.com',
    'COP', 0.19,
    'Calle 123 #45-67, Medellín',
    '+57 300 123 4567',
    'TRIAL',
    trialEndsAt,
  ]);

  if (!company.length) {
    console.log('⚠️  Company already exists, skipping seed.');
    await AppDataSource.destroy();
    return;
  }

  const companyId = company[0].id;
  console.log(`✅ Company created: ${companyId}`);

  // ── Admin User ────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const adminPerms = [
    'products:view','products:create','products:edit','products:delete',
    'inventory:view','inventory:adjust',
    'customers:view','customers:create','customers:edit','customers:delete',
    'sales:view','sales:create','sales:cancel',
    'debts:view','debts:manage',
    'payments:view','payments:create',
    'reports:view','reports:export',
    'users:view','users:manage',
    'company:settings','subscription:manage',
  ].join(',');

  const adminUser = await AppDataSource.query(`
    INSERT INTO users (company_id, name, email, password_hash, role, custom_permissions)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id
  `, [companyId, 'Administrador Demo', 'admin@ferreteria.com', passwordHash, 'ADMIN', adminPerms]);
  console.log(`✅ Admin user: admin@ferreteria.com / Admin1234!`);

  // ── Manager User ──────────────────────────────────────────────────────────
  const mgr = await bcrypt.hash('Manager1234!', 12);
  const mgrPerms = [
    'products:view','products:create','products:edit',
    'inventory:view','inventory:adjust',
    'customers:view','customers:create','customers:edit',
    'sales:view','sales:create','sales:cancel',
    'debts:view','debts:manage',
    'payments:view','payments:create',
    'reports:view','reports:export',
    'users:view',
  ].join(',');
  await AppDataSource.query(`
    INSERT INTO users (company_id, name, email, password_hash, role, custom_permissions)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [companyId, 'Gerente Demo', 'gerente@ferreteria.com', mgr, 'MANAGER', mgrPerms]);
  console.log(`✅ Manager user: gerente@ferreteria.com / Manager1234!`);

  // ── Seller User ───────────────────────────────────────────────────────────
  const sel = await bcrypt.hash('Seller1234!', 12);
  const selPerms = [
    'products:view','customers:view','customers:create',
    'sales:view','sales:create',
    'debts:view','payments:view','payments:create',
  ].join(',');
  await AppDataSource.query(`
    INSERT INTO users (company_id, name, email, password_hash, role, custom_permissions)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [companyId, 'Vendedor Demo', 'vendedor@ferreteria.com', sel, 'SELLER', selPerms]);
  console.log(`✅ Seller user: vendedor@ferreteria.com / Seller1234!`);

  // ── Products ──────────────────────────────────────────────────────────────
  const products = [
    ['Tornillo 1/4 x 1 pulgada (caja x100)', 'TRN-001', 'Ferretería', 'Tornillos SA', 8500, 4200, 250, 50, 'caja'],
    ['Martillo de Carpintero 16oz', 'HER-001', 'Herramientas', 'Stanley', 45000, 28000, 30, 5, 'unidad'],
    ['Cable eléctrico THHN #12 (metro)', 'ELE-001', 'Eléctrico', 'Condumex', 3200, 1800, 500, 100, 'metro'],
    ['Llave de tubo 12 pulgadas', 'HER-002', 'Herramientas', 'Urrea', 38000, 22000, 15, 3, 'unidad'],
    ['Pintura blanca 1 galón', 'PIN-001', 'Pintura', 'Pintuco', 68000, 42000, 40, 8, 'galón'],
    ['Cemento Gris 50kg', 'CON-001', 'Construcción', 'Argos', 35000, 24000, 80, 20, 'bulto'],
    ['Cinta métrica 5 metros', 'HER-003', 'Herramientas', 'Stanley', 22000, 12000, 25, 5, 'unidad'],
    ['Interruptor sencillo', 'ELE-002', 'Eléctrico', 'Legrand', 12000, 7000, 60, 10, 'unidad'],
    ['Tubo PVC 1/2 pulgada x 6m', 'PLO-001', 'Plomería', 'Pavco', 18500, 11000, 45, 10, 'unidad'],
    ['Llave de paso 1/2 pulgada', 'PLO-002', 'Plomería', 'Pavco', 28000, 16000, 20, 5, 'unidad'],
  ];

  const productIds: string[] = [];
  for (const [name, sku, category, brand, price, cost, stock, min_stock, unit] of products) {
    const res = await AppDataSource.query(`
      INSERT INTO products (company_id, name, sku, category, brand, price, cost, stock, min_stock, unit)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `, [companyId, name, sku, category, brand, price, cost, stock, min_stock, unit]);
    productIds.push(res[0].id);
  }
  console.log(`✅ ${products.length} products created`);

  // ── Customers ─────────────────────────────────────────────────────────────
  const customers = [
    ['Carlos Rodríguez', 'carlos@email.com', '300 111 2233', 'Cra 10 #20-30', '12345678', 'CC'],
    ['Constructora El Pino SAS', 'compras@elpino.com', '604 555 1234', 'Av Laureles 45', '900123456-1', 'NIT'],
    ['María González', 'maria.g@gmail.com', '315 987 6543', 'Cl 80 #15-22', '98765432', 'CC'],
    ['Pedro Jiménez', '', '320 444 5566', 'Bello, Antioquia', '55667788', 'CC'],
    ['Remodelaciones López', 'info@remolop.com', '604 333 9988', 'Itagüí, Carrera 55', '800987654-2', 'NIT'],
  ];

  const customerIds: string[] = [];
  for (const [name, email, phone, address, doc, doc_type] of customers) {
    const res = await AppDataSource.query(`
      INSERT INTO customers (company_id, name, email, phone, address, document_number, document_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `, [companyId, name, email || null, phone, address, doc, doc_type]);
    customerIds.push(res[0].id);
  }
  console.log(`✅ ${customers.length} customers created`);

  // ── Sample CASH sale ──────────────────────────────────────────────────────
  const userId = adminUser[0].id;
  const saleItems = [
    { product_id: productIds[0], product_name: products[0][0], qty: 5, price: 8500 },
    { product_id: productIds[1], product_name: products[1][0], qty: 1, price: 45000 },
  ];
  const subtotal = saleItems.reduce((s, i) => s + i.qty * i.price, 0);
  const taxAmount = subtotal * 0.19;
  const total = subtotal + taxAmount;

  const saleRes = await AppDataSource.query(`
    INSERT INTO sales (company_id, customer_id, user_id, invoice_number, type, status, subtotal, tax_amount, discount, total, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id
  `, [companyId, customerIds[0], userId, 'INV-2024-000001', 'CASH', 'COMPLETED',
      subtotal, taxAmount, 0, total, 'Venta de demostración']);

  const saleId = saleRes[0].id;
  for (const item of saleItems) {
    await AppDataSource.query(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, discount, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [saleId, item.product_id, item.product_name, item.qty, item.price, 0, item.qty * item.price]);

    await AppDataSource.query(`
      UPDATE products SET stock = stock - $1 WHERE id = $2
    `, [item.qty, item.product_id]);

    await AppDataSource.query(`
      INSERT INTO inventory_movements (company_id, product_id, user_id, sale_id, type, quantity, stock_before, stock_after, reason)
      SELECT $1, $2, $3, $4, 'OUT', $5,
             (SELECT stock + $5 FROM products WHERE id=$2),
             (SELECT stock FROM products WHERE id=$2),
             $6
    `, [companyId, item.product_id, userId, saleId, item.qty, `Venta INV-2024-000001`]);
  }
  console.log(`✅ Sample cash sale created: INV-2024-000001 — $${total.toLocaleString('es-CO')}`);

  // ── Sample CREDIT sale + debt ─────────────────────────────────────────────
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const creditItems = [{ product_id: productIds[5], product_name: products[5][0], qty: 10, price: 35000 }];
  const cSub = creditItems.reduce((s, i) => s + i.qty * i.price, 0);
  const cTax = cSub * 0.19;
  const cTotal = cSub + cTax;

  const cSaleRes = await AppDataSource.query(`
    INSERT INTO sales (company_id, customer_id, user_id, invoice_number, type, status, subtotal, tax_amount, discount, total, due_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id
  `, [companyId, customerIds[1], userId, 'INV-2024-000002', 'CREDIT', 'COMPLETED',
      cSub, cTax, 0, cTotal, dueDate]);

  const cSaleId = cSaleRes[0].id;
  for (const item of creditItems) {
    await AppDataSource.query(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, discount, subtotal)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [cSaleId, item.product_id, item.product_name, item.qty, item.price, 0, item.qty * item.price]);
    await AppDataSource.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [item.qty, item.product_id]);
  }

  await AppDataSource.query(`
    INSERT INTO debts (company_id, sale_id, customer_id, total_amount, paid_amount, remaining_amount, status, due_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [companyId, cSaleId, customerIds[1], cTotal, 0, cTotal, 'PENDING', dueDate]);
  console.log(`✅ Sample credit sale + debt created: INV-2024-000002 — $${cTotal.toLocaleString('es-CO')}`);

  // ── Custom role example ───────────────────────────────────────────────────
  await AppDataSource.query(`
    INSERT INTO custom_roles (company_id, name, description, permissions)
    VALUES ($1,$2,$3,$4)
  `, [
    companyId,
    'Cajero',
    'Acceso a ventas y cobros solamente',
    'products:view,customers:view,sales:view,sales:create,payments:view,payments:create,debts:view',
  ]);
  console.log(`✅ Custom role "Cajero" created`);

  await AppDataSource.destroy();
  console.log('\n🎉 Seed completed successfully!');
  console.log('─────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  ADMIN   → admin@ferreteria.com    / Admin1234!');
  console.log('  MANAGER → gerente@ferreteria.com  / Manager1234!');
  console.log('  SELLER  → vendedor@ferreteria.com / Seller1234!');
  console.log('─────────────────────────────────────');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
