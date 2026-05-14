// ─────────────────────────────────────────────────────────────────────────────
// CustomersController — CRUD de clientes finales de la empresa
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto, UpdateCustomerDto, FilterCustomersDto,
} from './dto/customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Permissions(Permission.CUSTOMERS_VIEW)
  @ApiOperation({
    summary: 'Listar clientes (paginado)',
    description: 'Devuelve los clientes de la empresa autenticada. Soporta búsqueda y filtros.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado paginado',
    schema: {
      example: {
        data: [{ id: 'uuid', name: 'Juan Pérez', email: 'juan@gmail.com', is_active: true }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterCustomersDto) {
    return this.customersService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Detalle de un cliente' })
  @ApiParam({ name: 'id', description: 'UUID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.customersService.findOne(id, company.id);
  }

  @Get(':id/history')
  @Permissions(Permission.CUSTOMERS_VIEW)
  @ApiOperation({
    summary: 'Historial completo del cliente',
    description: 'Incluye ventas, deudas y pagos asociados al cliente.',
  })
  @ApiParam({ name: 'id', description: 'UUID del cliente' })
  findHistory(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.customersService.findOneWithHistory(id, company.id);
  }

  @Post()
  @Permissions(Permission.CUSTOMERS_CREATE)
  @ApiOperation({ summary: 'Crear cliente' })
  @ApiBody({ type: CreateCustomerDto })
  @ApiResponse({ status: 201, description: 'Cliente creado' })
  create(@Body() dto: CreateCustomerDto, @CurrentCompany() company: Company) {
    return this.customersService.create(dto, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.CUSTOMERS_EDIT)
  @ApiOperation({ summary: 'Actualizar cliente' })
  @ApiParam({ name: 'id', description: 'UUID del cliente' })
  @ApiBody({ type: UpdateCustomerDto })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentCompany() company: Company) {
    return this.customersService.update(id, dto, company.id);
  }

  @Delete(':id')
  @Permissions(Permission.CUSTOMERS_DELETE)
  @ApiOperation({ summary: 'Eliminar cliente (soft delete)' })
  @ApiParam({ name: 'id', description: 'UUID del cliente' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.customersService.remove(id, company.id);
  }
}
