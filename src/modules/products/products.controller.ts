// ─────────────────────────────────────────────────────────────────────────────
// ProductsController — CRUD de productos del catálogo
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, FilterProductsDto } from './dto/product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Permissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({
    summary: 'Listar productos (paginado)',
    description: 'Devuelve productos del catálogo con búsqueda, filtros y paginación.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid', name: 'Camiseta polo', sku: 'POLO-AZUL-M',
          price: 89000, stock: 50, is_active: true,
        }],
        meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterProductsDto) {
    return this.productsService.findAll(company.id, filters);
  }

  @Get('low-stock')
  @Permissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({
    summary: 'Productos con stock bajo',
    description: 'Devuelve productos cuyo `stock` es menor o igual a `min_stock`.',
  })
  getLowStock(@CurrentCompany() company: Company) {
    return this.productsService.getLowStock(company.id);
  }

  @Get('categories')
  @Permissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Lista de categorías existentes en la empresa' })
  @ApiResponse({ status: 200, schema: { example: ['Ropa', 'Calzado', 'Accesorios'] } })
  getCategories(@CurrentCompany() company: Company) {
    return this.productsService.getCategories(company.id);
  }

  @Get(':id')
  @Permissions(Permission.PRODUCTS_VIEW)
  @ApiOperation({ summary: 'Detalle de un producto' })
  @ApiParam({ name: 'id', description: 'UUID del producto' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.productsService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.PRODUCTS_CREATE)
  @ApiOperation({ summary: 'Crear producto' })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Producto creado' })
  @ApiResponse({ status: 400, description: 'SKU duplicado o validación fallida' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.productsService.create(dto, company.id, user?.id);
  }

  @Patch(':id')
  @Permissions(Permission.PRODUCTS_EDIT)
  @ApiOperation({ summary: 'Actualizar producto' })
  @ApiParam({ name: 'id', description: 'UUID del producto' })
  @ApiBody({ type: UpdateProductDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.productsService.update(id, dto, company.id, user?.id);
  }

  @Delete(':id')
  @Permissions(Permission.PRODUCTS_DELETE)
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  @ApiParam({ name: 'id', description: 'UUID del producto' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.productsService.remove(id, company.id);
  }
}
