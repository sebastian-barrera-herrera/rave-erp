// ─────────────────────────────────────────────────────────────────────────────
// InventoryController — movimientos de stock (entradas, salidas, ajustes)
// ─────────────────────────────────────────────────────────────────────────────
// Las ventas generan movimientos OUT automáticos; este controlador permite
// ajustar manualmente el stock (compras, mermas, correcciones).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto, FilterMovementsDto } from './dto/inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Permissions(Permission.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Listar movimientos de inventario (paginado)' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid', type: 'IN', quantity: 20,
          stock_before: 30, stock_after: 50,
          reason: 'Compra a proveedor', reference: 'FAC-PROV-2026-0421',
          product: { id: 'uuid', name: 'Camiseta polo' },
          created_at: '2026-05-06T10:00:00Z',
        }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterMovementsDto) {
    return this.inventoryService.findAll(company.id, filters);
  }

  @Get('product/:productId')
  @Permissions(Permission.INVENTORY_VIEW)
  @ApiOperation({ summary: 'Historial de movimientos de un producto específico' })
  @ApiParam({ name: 'productId', description: 'UUID del producto' })
  findByProduct(@Param('productId') productId: string, @CurrentCompany() company: Company) {
    return this.inventoryService.findByProduct(productId, company.id);
  }

  @Post('adjust')
  @Permissions(Permission.INVENTORY_ADJUST)
  @ApiOperation({
    summary: 'Ajustar stock manualmente',
    description:
      'Registra un movimiento IN, OUT o ADJUSTMENT. ' +
      '`IN` suma stock, `OUT` resta stock, `ADJUSTMENT` corrige el stock al valor exacto.',
  })
  @ApiBody({ type: AdjustInventoryDto })
  @ApiResponse({ status: 201, description: 'Movimiento registrado y stock actualizado' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente para movimiento OUT' })
  adjust(
    @Body() dto: AdjustInventoryDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.adjust(dto, company.id, user.id);
  }
}
