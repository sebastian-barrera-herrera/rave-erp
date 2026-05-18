// ─────────────────────────────────────────────────────────────────────────────
// ServicesController — Servicios técnicos prestados a clientes
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
} from '@nestjs/swagger';
import { ServicesService } from './services.service';
import {
  CreateServiceDto, UpdateServiceDto, FilterServicesDto,
} from './dto/service.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Services')
@ApiBearerAuth()
@Controller('services')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Permissions(Permission.SERVICES_VIEW)
  @ApiOperation({ summary: 'Listar servicios (paginado)' })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterServicesDto) {
    return this.servicesService.findAll(company.id, filters);
  }

  @Get('categories')
  @Permissions(Permission.SERVICES_VIEW)
  @ApiOperation({ summary: 'Listar categorías de servicio usadas en la empresa' })
  categories(@CurrentCompany() company: Company) {
    return this.servicesService.categories(company.id);
  }

  @Get(':id')
  @Permissions(Permission.SERVICES_VIEW)
  @ApiOperation({ summary: 'Detalle de un servicio' })
  @ApiParam({ name: 'id' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.servicesService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.SERVICES_CREATE)
  @ApiOperation({ summary: 'Registrar un servicio' })
  create(@Body() dto: CreateServiceDto, @CurrentCompany() company: Company) {
    return this.servicesService.create(dto, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.SERVICES_EDIT)
  @ApiOperation({ summary: 'Actualizar servicio' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentCompany() company: Company,
  ) {
    return this.servicesService.update(id, dto, company.id);
  }

  @Delete(':id')
  @Permissions(Permission.SERVICES_DELETE)
  @ApiOperation({ summary: 'Eliminar servicio (soft delete)' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.servicesService.remove(id, company.id);
  }
}
