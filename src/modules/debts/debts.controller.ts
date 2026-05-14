// ─────────────────────────────────────────────────────────────────────────────
// DebtsController — cuentas por cobrar (deudas que clientes deben pagar)
// ─────────────────────────────────────────────────────────────────────────────
// Las deudas se crean automáticamente al hacer una venta type=CREDIT.
// Para registrar abonos sobre una deuda, usar el módulo Payments.
// ─────────────────────────────────────────────────────────────────────────────
import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { DebtsService } from './debts.service';
import { FilterDebtsDto, UpdateDebtDto } from './dto/debt.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Debts')
@ApiBearerAuth()
@Controller('debts')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  @Permissions(Permission.DEBTS_VIEW)
  @ApiOperation({ summary: 'Listar deudas (paginado)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid',
          customer: { id: 'uuid', name: 'Juan Pérez' },
          total_amount: 250000, paid_amount: 100000, remaining_amount: 150000,
          status: 'PARTIAL',
          due_date: '2026-06-15',
        }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterDebtsDto) {
    return this.debtsService.findAll(company.id, filters);
  }

  @Get('summary')
  @Permissions(Permission.DEBTS_VIEW)
  @ApiOperation({
    summary: 'Resumen agregado de deudas',
    description: 'Totales de deudas por estado: total, pagado, restante, conteo por estado.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        total_amount: '5000000', paid_amount: '2000000', remaining_amount: '3000000',
        total_debts: '12', paid_count: '5', pending_count: '4', overdue_count: '3',
      },
    },
  })
  getSummary(@CurrentCompany() company: Company) {
    return this.debtsService.getSummary(company.id);
  }

  @Get(':id')
  @Permissions(Permission.DEBTS_VIEW)
  @ApiOperation({ summary: 'Detalle de una deuda con sus pagos' })
  @ApiParam({ name: 'id', description: 'UUID de la deuda' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.debtsService.findOne(id, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.DEBTS_VIEW)
  @ApiOperation({
    summary: 'Editar deuda',
    description: 'Permite ajustar fecha de vencimiento y notas. '
      + 'Los montos solo cambian al registrar pagos.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la deuda' })
  @ApiBody({ type: UpdateDebtDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
    @CurrentCompany() company: Company,
  ) {
    return this.debtsService.update(id, dto, company.id);
  }
}
