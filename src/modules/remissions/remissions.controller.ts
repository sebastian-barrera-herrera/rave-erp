// ─────────────────────────────────────────────────────────────────────────────
// RemissionsController — Órdenes de salida (remisiones)
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
  Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiProduces,
} from '@nestjs/swagger';
import { RemissionsService } from './remissions.service';
import { CreateRemissionDto, FilterRemissionsDto } from './dto/remission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Remissions')
@ApiBearerAuth()
@Controller('remissions')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class RemissionsController {
  constructor(private readonly remissionsService: RemissionsService) {}

  @Get()
  @Permissions(Permission.REMISSIONS_VIEW)
  @ApiOperation({
    summary: 'Listar remisiones (paginado)',
    description: 'Filtros: status, cliente, bodega, vendedor, rango de fechas y número.',
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterRemissionsDto) {
    return this.remissionsService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.REMISSIONS_VIEW)
  @ApiOperation({ summary: 'Detalle de remisión (con líneas)' })
  @ApiParam({ name: 'id', description: 'UUID de la remisión' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.remissionsService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.REMISSIONS_CREATE)
  @ApiOperation({
    summary: 'Crear remisión',
    description:
      'Genera el número (`REM-{año}-{6 dígitos}` por empresa), descuenta stock '
      + 'de la bodega indicada (o la principal por defecto) y crea movimientos '
      + 'de inventario por cada línea con producto rastreable.',
  })
  @ApiBody({ type: CreateRemissionDto })
  @ApiResponse({ status: 201, description: 'Remisión creada' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente o validación fallida' })
  create(
    @Body() dto: CreateRemissionDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.remissionsService.create(dto, company.id, user.id);
  }

  @Post(':id/cancel')
  @Permissions(Permission.REMISSIONS_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar remisión',
    description: 'Restaura el stock de cada línea con producto rastreable a la bodega original.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la remisión' })
  cancel(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.remissionsService.cancel(id, company.id, user.id);
  }

  @Get(':id/pdf')
  @Permissions(Permission.REMISSIONS_VIEW)
  @ApiOperation({ summary: 'Descargar remisión en PDF' })
  @ApiParam({ name: 'id', description: 'UUID de la remisión' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @Res() res: Response,
  ) {
    const buffer = await this.remissionsService.generatePdf(id, company.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="remision-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
