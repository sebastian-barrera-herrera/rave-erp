// ─────────────────────────────────────────────────────────────────────────────
// PaymentsController — pagos aplicados a deudas (cuentas por cobrar)
// ─────────────────────────────────────────────────────────────────────────────
// Cada pago descuenta del `remaining_amount` de la deuda y, cuando llega a 0,
// la deuda pasa a estado PAID automáticamente.
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, FilterPaymentsDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions(Permission.PAYMENTS_VIEW)
  @ApiOperation({
    summary: 'Listar pagos (paginado)',
    description: 'Histórico de pagos aplicados a deudas. Soporta filtros por deuda, método y fechas.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid',
          amount: 100000, method: 'CASH', reference: null,
          debt_id: 'uuid-debt', user_id: 'uuid-user',
          created_at: '2026-05-06T16:00:00Z',
        }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterPaymentsDto) {
    return this.paymentsService.findAll(company.id, filters);
  }

  @Post('debt/:debtId')
  @Permissions(Permission.PAYMENTS_CREATE)
  @ApiOperation({
    summary: 'Registrar un pago a una deuda',
    description:
      'Aplica un abono sobre la deuda indicada. Si el monto cubre el total restante, '
      + 'la deuda pasa a `PAID`; si no, queda en `PARTIAL`.',
  })
  @ApiParam({ name: 'debtId', description: 'UUID de la deuda' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({ status: 201, description: 'Pago registrado' })
  @ApiResponse({ status: 400, description: 'El monto excede el restante o la deuda ya está PAID' })
  @ApiResponse({ status: 404, description: 'Deuda no encontrada' })
  create(
    @Param('debtId') debtId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.create(debtId, dto, company.id, user.id);
  }
}
