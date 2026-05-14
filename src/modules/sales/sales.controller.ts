// ─────────────────────────────────────────────────────────────────────────────
// SalesController — Ventas (contado / crédito)
// ─────────────────────────────────────────────────────────────────────────────
// Reglas de negocio:
//   - type=CASH    → venta de contado, no genera deuda
//   - type=CREDIT  → genera automáticamente una Debt asociada (due_date obligatoria)
//   - Toda venta descuenta stock de los productos (si track_stock=true)
//   - Cancelar una venta restaura el stock y elimina la deuda asociada
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
  Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiProduces,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto, FilterSalesDto, SendSaleDto } from './dto/sale.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Permissions(Permission.SALES_VIEW)
  @ApiOperation({
    summary: 'Listar ventas (paginado)',
    description: 'Soporta filtros por tipo, estado, cliente, rango de fechas y número de factura.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid', invoice_number: 'INV-2026-000001',
          type: 'CASH', status: 'COMPLETED',
          subtotal: 178000, tax_amount: 33820, total: 211820,
          customer: { id: 'uuid', name: 'Juan Pérez' },
          created_at: '2026-05-06T15:30:00Z',
        }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterSalesDto) {
    return this.salesService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Detalle de una venta (incluye items, cliente y deuda)' })
  @ApiParam({ name: 'id', description: 'UUID de la venta' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.salesService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.SALES_CREATE)
  @ApiOperation({
    summary: 'Crear venta',
    description:
      'Crea una venta con sus líneas. Calcula impuestos según `tax_rate` de la empresa. '
      + 'Para `type=CREDIT` genera automáticamente una Debt y exige `due_date`.',
  })
  @ApiBody({
    type: CreateSaleDto,
    examples: {
      contado: {
        summary: 'Venta de contado',
        value: {
          customer_id: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56',
          type: 'CASH',
          items: [
            { product_id: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456', quantity: 2 },
            { product_id: '8d8d2222-94f3-4a9d-9b01-7b2dca654321', quantity: 1, discount: 5000 },
          ],
          discount: 0,
          notes: 'Cliente recurrente',
        },
      },
      credito: {
        summary: 'Venta a crédito',
        value: {
          customer_id: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56',
          type: 'CREDIT',
          items: [{ product_id: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456', quantity: 5 }],
          due_date: '2026-06-15',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Venta creada' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente, cliente inexistente, due_date faltante en CREDIT' })
  create(@Body() dto: CreateSaleDto, @CurrentCompany() company: Company, @CurrentUser() user: any) {
    return this.salesService.create(dto, company.id, user.id);
  }

  @Post(':id/cancel')
  @Permissions(Permission.SALES_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar venta',
    description: 'Restaura el stock de cada item y elimina la deuda asociada (si la había).',
  })
  @ApiParam({ name: 'id', description: 'UUID de la venta' })
  @ApiResponse({ status: 200, description: 'Venta cancelada y stock revertido' })
  cancel(@Param('id') id: string, @CurrentCompany() company: Company, @CurrentUser() user: any) {
    return this.salesService.cancel(id, company.id, user.id);
  }

  @Post(':id/send-email')
  @Permissions(Permission.SALES_SEND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar factura al cliente por correo',
    description:
      'Envía la factura PDF por correo. Por defecto se envía al email del cliente; '
      + 'si no lo tiene registrado, se puede pasar `to` con un destinatario alterno. '
      + 'No se permite en ventas canceladas.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la venta' })
  @ApiBody({ type: SendSaleDto })
  @ApiResponse({ status: 200, description: 'Correo enviado' })
  @ApiResponse({ status: 400, description: 'Cliente sin email y sin override, o venta cancelada' })
  sendByEmail(
    @Param('id') id: string,
    @Body() dto: SendSaleDto,
    @CurrentCompany() company: Company,
  ) {
    return this.salesService.sendByEmail(id, company.id, dto);
  }

  @Get(':id/pdf')
  @Permissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Descargar factura en PDF' })
  @ApiParam({ name: 'id', description: 'UUID de la venta' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'Archivo PDF binario' })
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @Res() res: Response,
  ) {
    const buffer = await this.salesService.generateInvoicePdf(id, company.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="factura-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
