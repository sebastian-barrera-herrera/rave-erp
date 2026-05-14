// ─────────────────────────────────────────────────────────────────────────────
// WarehousesController — bodegas y stock por bodega
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import {
  CreateWarehouseDto, UpdateWarehouseDto,
  AdjustWarehouseStockDto, TransferStockDto,
} from './dto/warehouse.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  @Permissions(Permission.WAREHOUSES_VIEW)
  @ApiOperation({
    summary: 'Listar bodegas de la empresa',
    description: 'Incluye `products_count` (cantidad de productos con stock registrado por bodega).',
  })
  findAll(@CurrentCompany() company: Company) {
    return this.warehousesService.findAll(company.id);
  }

  @Get(':id')
  @Permissions(Permission.WAREHOUSES_VIEW)
  @ApiOperation({ summary: 'Detalle de bodega' })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.warehousesService.findOne(id, company.id);
  }

  @Get(':id/stock')
  @Permissions(Permission.WAREHOUSES_VIEW)
  @ApiOperation({ summary: 'Listar stock de los productos en una bodega' })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  listStock(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.warehousesService.listStock(id, company.id);
  }

  @Post()
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @ApiOperation({ summary: 'Crear bodega' })
  @ApiBody({ type: CreateWarehouseDto })
  create(@Body() dto: CreateWarehouseDto, @CurrentCompany() company: Company) {
    return this.warehousesService.create(dto, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @ApiOperation({
    summary: 'Actualizar bodega',
    description: 'Cambiar `is_sellable=false` excluye los productos de esta bodega de las ventas.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  @ApiBody({ type: UpdateWarehouseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentCompany() company: Company,
  ) {
    return this.warehousesService.update(id, dto, company.id);
  }

  @Patch(':id/set-default')
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar bodega como la principal' })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  setDefault(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.warehousesService.setDefault(id, company.id);
  }

  @Post(':id/stock')
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ajustar stock absoluto de un producto en la bodega',
    description: 'Crea o actualiza la entrada de stock y registra un movimiento de inventario.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  @ApiBody({ type: AdjustWarehouseStockDto })
  adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustWarehouseStockDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.adjustStock(id, dto, company.id, user.id);
  }

  @Post('transfer')
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transferir stock entre bodegas' })
  @ApiBody({ type: TransferStockDto })
  transfer(
    @Body() dto: TransferStockDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.warehousesService.transfer(dto, company.id, user.id);
  }

  @Delete(':id')
  @Permissions(Permission.WAREHOUSES_MANAGE)
  @ApiOperation({
    summary: 'Eliminar bodega (soft delete)',
    description: 'No se puede eliminar la bodega principal ni bodegas con stock > 0.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la bodega' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.warehousesService.remove(id, company.id);
  }
}
