// ─────────────────────────────────────────────────────────────────────────────
// ReportsController — reportes y estadísticas de la empresa
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery, ApiProduces,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';
import { PdfService } from '../pdf/pdf.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfService: PdfService,
  ) {}

  @Get('dashboard')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({
    summary: 'Métricas del dashboard',
    description: 'Totales de ventas, clientes activos, productos, deudas pendientes, etc.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        sales_today: 5, sales_today_total: 1200000,
        sales_month: 120, sales_month_total: 28000000,
        active_customers: 87, total_products: 350,
        debts_pending: 12, debts_overdue: 3,
      },
    },
  })
  getDashboard(@CurrentCompany() company: Company) {
    return this.reportsService.getDashboard(company.id);
  }

  @Get('sales-summary')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({
    summary: 'Resumen de ventas por período',
    description: 'Agrupa ventas por día, mes o año dentro del rango indicado.',
  })
  @ApiQuery({ name: 'date_from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'date_to', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'group_by', required: false, enum: ['day', 'month', 'year'], example: 'day' })
  getSalesSummary(
    @CurrentCompany() company: Company,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('group_by') groupBy: 'day' | 'month' | 'year',
  ) {
    const from = dateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const to = dateTo || new Date().toISOString();
    return this.reportsService.getSalesSummary(company.id, from, to, groupBy || 'day');
  }

  @Get('top-products')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({ summary: 'Productos más vendidos' })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTopProducts(
    @CurrentCompany() company: Company,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('limit') limit: number,
  ) {
    // Sin filtros explícitos miramos los últimos 12 meses — el "inicio de
    // año" dejaba fuera ventas previas y daba sensación de "sin datos".
    const now = new Date();
    const from = dateFrom
      || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
    const to = dateTo || now.toISOString();
    return this.reportsService.getTopProducts(company.id, from, to, limit || 10);
  }

  @Get('sales-by-seller')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({
    summary: 'Comparativa de desempeño por vendedor',
    description:
      'Devuelve por cada usuario que registró ventas en el rango: total_sales, '
      + 'revenue, avg_ticket, last_sale y customers (clientes únicos). Ordenado '
      + 'por revenue desc — sirve para gráficas comparativas.',
  })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({
    status: 200,
    schema: {
      example: [{
        user_id: 'uuid', user_name: 'María Gómez', role: 'SELLER',
        total_sales: 45, revenue: 8500000, avg_ticket: 188888,
        customers: 22, last_sale: '2026-05-06T10:00:00Z',
      }],
    },
  })
  getSalesBySeller(
    @CurrentCompany() company: Company,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('limit') limit: number,
  ) {
    // Por defecto miramos los últimos 12 meses para que un vendedor
    // recién contratado o uno que descansó el mes en curso sigan apareciendo.
    const now = new Date();
    const from = dateFrom
      || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
    const to = dateTo || now.toISOString();
    return this.reportsService.getSalesBySeller(company.id, from, to, limit || 20);
  }

  @Get('top-customers')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({ summary: 'Clientes que más han comprado' })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  getTopCustomers(
    @CurrentCompany() company: Company,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('limit') limit: number,
  ) {
    const now = new Date();
    const from = dateFrom
      || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString();
    const to = dateTo || now.toISOString();
    return this.reportsService.getTopCustomers(company.id, from, to, limit || 10);
  }

  @Get('debts')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({ summary: 'Reporte de deudas (cuentas por cobrar)' })
  getDebtReport(@CurrentCompany() company: Company) {
    return this.reportsService.getDebtReport(company.id);
  }

  @Get('inventory')
  @Permissions(Permission.REPORTS_VIEW)
  @ApiOperation({ summary: 'Reporte de inventario actual' })
  getInventoryReport(@CurrentCompany() company: Company) {
    return this.reportsService.getInventoryReport(company.id);
  }

  @Get('inventory/pdf')
  @Permissions(Permission.REPORTS_EXPORT)
  @ApiOperation({ summary: 'Exportar reporte de inventario en PDF' })
  @ApiProduces('application/pdf')
  async downloadInventoryPdf(@CurrentCompany() company: Company, @Res() res: Response) {
    const data = await this.reportsService.getInventoryReport(company.id);
    const buffer = await this.pdfService.generateInventoryReport(data, company);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="inventario.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sales/pdf')
  @Permissions(Permission.REPORTS_EXPORT)
  @ApiOperation({ summary: 'Exportar reporte de ventas en PDF' })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to', required: false })
  @ApiProduces('application/pdf')
  async downloadSalesPdf(
    @CurrentCompany() company: Company,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Res() res: Response,
  ) {
    const from = dateFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const to = dateTo || new Date().toISOString();
    const data = await this.reportsService.getSalesSummary(company.id, from, to, 'day');
    const buffer = await this.pdfService.generateSalesReport(data, company, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="reporte-ventas.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
