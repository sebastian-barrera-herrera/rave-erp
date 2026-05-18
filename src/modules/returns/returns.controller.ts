// ─────────────────────────────────────────────────────────────────────────────
// ReturnsController — Devoluciones de venta y averías de inventario
// ─────────────────────────────────────────────────────────────────────────────
// Reglas de negocio:
//   - type=SALE_RETURN repone stock + reduce deuda si existe
//   - type=DAMAGE      solo descuenta stock (sin venta asociada)
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
} from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import { CreateReturnDto, FilterReturnsDto } from './dto/return.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';

@ApiTags('Returns')
@ApiBearerAuth()
@Controller('returns')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  @Permissions(Permission.RETURNS_VIEW)
  @ApiOperation({ summary: 'Listar devoluciones / averías (paginado)' })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterReturnsDto) {
    return this.returnsService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.RETURNS_VIEW)
  @ApiOperation({ summary: 'Detalle de una devolución' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.returnsService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.RETURNS_CREATE)
  @ApiOperation({
    summary: 'Registrar devolución o avería',
    description:
      'SALE_RETURN: requiere sale_id (o customer_id). Repone stock y reduce ' +
      'deuda si la venta tenía crédito pendiente.\n' +
      'DAMAGE: solo descuenta stock — usar para mermas, productos rotos, etc.',
  })
  create(
    @Body() dto: CreateReturnDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: User,
  ) {
    return this.returnsService.create(dto, company.id, user.id);
  }
}
