import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { SaleItem } from '../sales/entities/sale-item.entity';
import { Debt } from '../debts/entities/debt.entity';
import { Product } from '../products/entities/product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { SaleStatus } from '../../common/types/enums';

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboard(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      salesToday,
      salesMonth,
      salesAllTime,
      salesPrevMonth,
      totalDebt,
      lowStockCount,
      activeCustomers,
      activeSellers,
      unitsSoldMonth,
      topProducts,
      recentSales,
    ] = await Promise.all([
      // Sales today
      this.dataSource.query(
        `SELECT COALESCE(SUM(total),0) as amount, COUNT(*) as count
         FROM sales WHERE company_id=$1 AND status='COMPLETED'
         AND created_at >= $2 AND deleted_at IS NULL`,
        [companyId, startOfDay],
      ),
      // Sales this month
      this.dataSource.query(
        `SELECT COALESCE(SUM(total),0) as amount, COUNT(*) as count
         FROM sales WHERE company_id=$1 AND status='COMPLETED'
         AND created_at >= $2 AND deleted_at IS NULL`,
        [companyId, startOfMonth],
      ),
      // Ventas históricas (todo el tiempo) — "cuánto va en total".
      this.dataSource.query(
        `SELECT COALESCE(SUM(total),0) as amount, COUNT(*) as count
         FROM sales WHERE company_id=$1 AND status='COMPLETED'
         AND deleted_at IS NULL`,
        [companyId],
      ),
      // Ventas del mes anterior — para calcular crecimiento %.
      this.dataSource.query(
        `SELECT COALESCE(SUM(total),0) as amount
         FROM sales WHERE company_id=$1 AND status='COMPLETED'
         AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL`,
        [companyId, startOfPrevMonth, startOfMonth],
      ),
      // Outstanding debt
      this.dataSource.query(
        `SELECT COALESCE(SUM(remaining_amount),0) as total
         FROM debts WHERE company_id=$1 AND status!='PAID' AND deleted_at IS NULL`,
        [companyId],
      ),
      // Low stock count
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM products
         WHERE company_id=$1 AND stock<=min_stock AND track_stock=true
         AND is_active=true AND deleted_at IS NULL`,
        [companyId],
      ),
      // Clientes activos en la empresa.
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM customers
         WHERE company_id=$1 AND deleted_at IS NULL`,
        [companyId],
      ),
      // Vendedores activos (usuarios que han registrado ventas en el mes).
      this.dataSource.query(
        `SELECT COUNT(DISTINCT s.user_id) as count
         FROM sales s
         WHERE s.company_id=$1 AND s.status='COMPLETED'
           AND s.created_at >= $2 AND s.deleted_at IS NULL`,
        [companyId, startOfMonth],
      ),
      // Unidades vendidas en el mes — reemplaza la métrica de "ticket promedio"
      // por una más accionable: cuántos productos saliste a colocar.
      this.dataSource.query(
        `SELECT COALESCE(SUM(si.quantity),0) as units
         FROM sale_items si
         JOIN sales s ON s.id=si.sale_id
         WHERE s.company_id=$1 AND s.status='COMPLETED'
           AND s.created_at >= $2 AND s.deleted_at IS NULL`,
        [companyId, startOfMonth],
      ),
      // Top 5 products this month by revenue
      this.dataSource.query(
        `SELECT p.name, p.sku,
                COALESCE(SUM(si.quantity),0) as units_sold,
                COALESCE(SUM(si.subtotal),0) as revenue
         FROM sale_items si
         JOIN products p ON p.id=si.product_id
         JOIN sales s ON s.id=si.sale_id
         WHERE s.company_id=$1 AND s.status='COMPLETED'
         AND s.created_at >= $2 AND s.deleted_at IS NULL
         GROUP BY p.id, p.name, p.sku
         ORDER BY revenue DESC LIMIT 5`,
        [companyId, startOfMonth],
      ),
      // Últimas 5 ventas COMPLETADAS (con cliente y vendedor) — alimenta
      // la lista "Ventas recientes" del dashboard.
      this.dataSource
        .getRepository(Sale)
        .createQueryBuilder('s')
        .leftJoin('s.customer', 'c')
        .leftJoin('s.user', 'u')
        .select([
          's.id', 's.invoice_number', 's.total', 's.type', 's.status', 's.created_at',
          'c.id', 'c.name',
          'u.id', 'u.name',
        ])
        .where('s.company_id = :cid', { cid: companyId })
        .andWhere('s.deleted_at IS NULL')
        .andWhere("s.status = 'COMPLETED'")
        .orderBy('s.created_at', 'DESC')
        .limit(5)
        .getMany(),
    ]);

    const monthRev = Number(salesMonth[0]?.amount || 0);
    const prevRev = Number(salesPrevMonth[0]?.amount || 0);
    // Si el mes anterior fue 0 y este tiene ventas, mostramos "100%" como
    // arranque. Si los dos son 0, mostramos 0.
    let growthPct = 0;
    if (prevRev > 0) growthPct = ((monthRev - prevRev) / prevRev) * 100;
    else if (monthRev > 0) growthPct = 100;

    return {
      kpis: {
        sales_today: { amount: Number(salesToday[0]?.amount || 0), count: Number(salesToday[0]?.count || 0) },
        sales_month: { amount: monthRev, count: Number(salesMonth[0]?.count || 0) },
        sales_total: { amount: Number(salesAllTime[0]?.amount || 0), count: Number(salesAllTime[0]?.count || 0) },
        sales_prev_month: prevRev,
        growth_vs_prev_month: Math.round(growthPct * 10) / 10,
        units_sold_month: Number(unitsSoldMonth[0]?.units || 0),
        outstanding_debt: Number(totalDebt[0]?.total || 0),
        low_stock_alerts: Number(lowStockCount[0]?.count || 0),
        active_customers: Number(activeCustomers[0]?.count || 0),
        active_sellers: Number(activeSellers[0]?.count || 0),
      },
      top_products: topProducts,
      recent_sales: recentSales,
    };
  }

  async getSalesSummary(companyId: string, dateFrom: string, dateTo: string, groupBy: 'day' | 'month' | 'year' = 'day') {
    const formatMap = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' };
    const fmt = formatMap[groupBy] || 'YYYY-MM-DD';

    return this.dataSource.query(
      `SELECT TO_CHAR(s.created_at, $1) as period,
              COUNT(*) as total_sales,
              COALESCE(SUM(s.total),0) as revenue,
              COALESCE(SUM(s.tax_amount),0) as taxes,
              COALESCE(SUM(s.discount),0) as discounts
       FROM sales s
       WHERE s.company_id=$2 AND s.status='COMPLETED'
         AND s.created_at BETWEEN $3 AND $4
         AND s.deleted_at IS NULL
       GROUP BY period
       ORDER BY period ASC`,
      [fmt, companyId, new Date(dateFrom), new Date(dateTo)],
    );
  }

  async getTopProducts(companyId: string, dateFrom: string, dateTo: string, limit = 10) {
    return this.dataSource.query(
      `SELECT p.id, p.name, p.sku, p.category,
              COALESCE(SUM(si.quantity),0) as units_sold,
              COALESCE(SUM(si.subtotal),0) as revenue,
              COALESCE(AVG(si.unit_price),0) as avg_price
       FROM sale_items si
       JOIN products p ON p.id=si.product_id
       JOIN sales s ON s.id=si.sale_id
       WHERE s.company_id=$1 AND s.status='COMPLETED'
         AND s.created_at BETWEEN $2 AND $3
         AND s.deleted_at IS NULL
       GROUP BY p.id, p.name, p.sku, p.category
       ORDER BY revenue DESC LIMIT $4`,
      [companyId, new Date(dateFrom), new Date(dateTo), limit],
    );
  }

  async getTopCustomers(companyId: string, dateFrom: string, dateTo: string, limit = 10) {
    // INNER JOIN: solo clientes que efectivamente compraron en el rango.
    // Antes con LEFT JOIN salían todos los clientes con total_spent=0,
    // dando sensación de "data quemada".
    return this.dataSource.query(
      `SELECT c.id, c.name, c.email, c.phone,
              COUNT(s.id)::int as total_purchases,
              COALESCE(SUM(s.total),0) as total_spent,
              MAX(s.created_at) as last_purchase
       FROM customers c
       INNER JOIN sales s ON s.customer_id=c.id AND s.status='COMPLETED'
         AND s.created_at BETWEEN $2 AND $3 AND s.deleted_at IS NULL
       WHERE c.company_id=$1 AND c.deleted_at IS NULL
       GROUP BY c.id, c.name, c.email, c.phone
       ORDER BY total_spent DESC
       LIMIT $4`,
      [companyId, new Date(dateFrom), new Date(dateTo), limit],
    );
  }

  async getDebtReport(companyId: string) {
    return this.dataSource.query(
      `SELECT c.name as customer_name, c.phone,
              d.total_amount, d.paid_amount, d.remaining_amount,
              d.status, d.due_date, d.created_at,
              s.invoice_number
       FROM debts d
       JOIN customers c ON c.id=d.customer_id
       JOIN sales s ON s.id=d.sale_id
       WHERE d.company_id=$1 AND d.deleted_at IS NULL
       ORDER BY d.remaining_amount DESC`,
      [companyId],
    );
  }

  /**
   * Ranking de vendedores en un rango de fechas.
   * Devuelve totales por usuario para comparar desempeño:
   * total_sales, revenue, avg_ticket, last_sale, customers (clientes únicos).
   */
  async getSalesBySeller(
    companyId: string,
    dateFrom: string,
    dateTo: string,
    limit = 20,
  ) {
    // Mostramos a TODOS los miembros activos de la empresa (no solo a los que
    // tuvieron ventas en el rango). Antes el `HAVING COUNT > 0` ocultaba al
    // resto del equipo y hacía pensar que la métrica estaba "quemada".
    return this.dataSource.query(
      `SELECT u.id as user_id, u.name as user_name, u.role,
              u.avatar_url,
              COUNT(s.id)::int as total_sales,
              COALESCE(SUM(s.total),0) as revenue,
              COALESCE(AVG(s.total),0) as avg_ticket,
              MAX(s.created_at) as last_sale,
              COUNT(DISTINCT s.customer_id)::int as customers
       FROM users u
       LEFT JOIN sales s
         ON s.user_id = u.id
        AND s.status = 'COMPLETED'
        AND s.deleted_at IS NULL
        AND s.created_at BETWEEN $2 AND $3
       WHERE u.company_id = $1
         AND u.deleted_at IS NULL
         AND u.is_active = true
       GROUP BY u.id, u.name, u.role, u.avatar_url
       ORDER BY revenue DESC, u.name ASC
       LIMIT $4`,
      [companyId, new Date(dateFrom), new Date(dateTo), limit],
    );
  }

  async getInventoryReport(companyId: string) {
    return this.dataSource.query(
      `SELECT p.name, p.sku, p.category, p.stock, p.min_stock,
              p.price, p.cost,
              (p.stock * p.cost) as stock_value,
              CASE WHEN p.stock<=p.min_stock THEN true ELSE false END as is_low_stock
       FROM products p
       WHERE p.company_id=$1 AND p.is_active=true AND p.deleted_at IS NULL
       ORDER BY p.category, p.name`,
      [companyId],
    );
  }
}
