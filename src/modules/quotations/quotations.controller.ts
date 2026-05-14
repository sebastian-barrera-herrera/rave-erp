// ─────────────────────────────────────────────────────────────────────────────
// QuotationsController — cotizaciones / propuestas comerciales
// ─────────────────────────────────────────────────────────────────────────────
// Flujo típico:
//   1. POST /quotations           → crear cotización en estado DRAFT
//   2. POST /quotations/:id/send-email → enviarla por correo (pasa a SENT)
//   3. PATCH /quotations/:id      → marcarla ACCEPTED o REJECTED según respuesta
//   4. GET /quotations/:id/pdf    → descargar PDF en cualquier momento
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiProduces,
} from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import {
  CreateQuotationDto, UpdateQuotationDto, FilterQuotationsDto, SendQuotationDto,
} from './dto/quotation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('quotations')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  @Permissions(Permission.QUOTATIONS_VIEW)
  @ApiOperation({ summary: 'Listar cotizaciones (paginado)' })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterQuotationsDto) {
    return this.quotationsService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.QUOTATIONS_VIEW)
  @ApiOperation({ summary: 'Detalle de una cotización (incluye items y cliente)' })
  @ApiParam({ name: 'id', description: 'UUID de la cotización' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.quotationsService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.QUOTATIONS_CREATE)
  @ApiOperation({
    summary: 'Crear cotización',
    description: 'La cotización inicia en estado DRAFT. Calcula impuestos según `tax_rate` de la empresa.',
  })
  @ApiBody({
    type: CreateQuotationDto,
    examples: {
      basico: {
        summary: 'Cotización con productos del catálogo',
        value: {
          customer_id: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56',
          items: [{
            product_id: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456',
            description: 'Camiseta polo azul talla M',
            quantity: 10, unit_price: 89000, discount: 0,
          }],
          notes: 'Pedido recurrente',
          terms: '50% anticipo, 50% contra entrega',
          valid_until: '2026-06-30',
        },
      },
      libre: {
        summary: 'Cotización con item libre (sin producto)',
        value: {
          customer_id: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56',
          items: [{
            description: 'Diseño de logo + manual de marca',
            quantity: 1, unit_price: 1500000,
          }],
        },
      },
    },
  })
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.quotationsService.create(dto, company.id, user.id);
  }

  @Patch(':id')
  @Permissions(Permission.QUOTATIONS_EDIT)
  @ApiOperation({ summary: 'Actualizar cotización (no permitido si ACCEPTED/REJECTED)' })
  @ApiParam({ name: 'id', description: 'UUID de la cotización' })
  @ApiBody({ type: UpdateQuotationDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentCompany() company: Company,
  ) {
    return this.quotationsService.update(id, dto, company.id);
  }

  @Delete(':id')
  @Permissions(Permission.QUOTATIONS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar cotización (soft delete; no permitido si ACCEPTED)' })
  @ApiParam({ name: 'id', description: 'UUID de la cotización' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.quotationsService.remove(id, company.id);
  }

  @Get(':id/pdf')
  @Permissions(Permission.QUOTATIONS_VIEW)
  @ApiOperation({ summary: 'Descargar cotización en PDF' })
  @ApiParam({ name: 'id', description: 'UUID de la cotización' })
  @ApiProduces('application/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @Res() res: Response,
  ) {
    const buffer = await this.quotationsService.generatePdf(id, company.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="cotizacion-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':id/send-email')
  @Permissions(Permission.QUOTATIONS_SEND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar cotización al cliente por correo',
    description: 'Envía el PDF al email del cliente. Si la cotización estaba en DRAFT, pasa a SENT.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la cotización' })
  @ApiBody({ type: SendQuotationDto })
  @ApiResponse({ status: 200, description: 'Correo enviado' })
  @ApiResponse({ status: 400, description: 'El cliente no tiene email registrado' })
  sendByEmail(
    @Param('id') id: string,
    @Body() dto: SendQuotationDto,
    @CurrentCompany() company: Company,
  ) {
    return this.quotationsService.sendByEmail(id, company.id, dto);
  }
}
