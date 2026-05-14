import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto, FilterProductsDto } from './dto/product.dto';
import { paginate } from '../../common/types/pagination.type';
import { WarehousesService } from '../warehouses/warehouses.service';
import { WarehouseStock } from '../warehouses/entities/warehouse-stock.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { MovementType } from '../../common/types/enums';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly warehousesService: WarehousesService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateProductDto, companyId: string, userId?: string) {
    const exists = await this.productRepo.findOne({
      where: { sku: dto.sku, company_id: companyId },
    });
    if (exists) throw new ConflictException(`Ya existe un producto con el SKU "${dto.sku}"`);

    return this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const product = productRepo.create({ ...dto, company_id: companyId });
      const saved = await productRepo.save(product);

      // CRITICAL: ensure the product has a WarehouseStock entry in the default
      // warehouse so it can immediately be sold. Sales validate per-warehouse
      // stock (not the legacy product.stock column).
      if (saved.track_stock !== false) {
        const warehouse = await this.warehousesService.getOrCreateDefault(companyId, manager);
        const stockRepo = manager.getRepository(WarehouseStock);
        const initialStock = Number(dto.stock ?? 0);
        const initialMin = Number(dto.min_stock ?? 0);

        const stockEntry = stockRepo.create({
          company_id: companyId,
          warehouse_id: warehouse.id,
          product_id: saved.id,
          stock: initialStock,
          min_stock: initialMin,
        });
        await stockRepo.save(stockEntry);

        // Record an IN movement so the inventory log is consistent.
        if (initialStock > 0 && userId) {
          const movRepo = manager.getRepository(InventoryMovement);
          await movRepo.save(
            movRepo.create({
              company_id: companyId,
              warehouse_id: warehouse.id,
              product_id: saved.id,
              user_id: userId,
              type: MovementType.IN,
              quantity: initialStock,
              stock_before: 0,
              stock_after: initialStock,
              reason: 'Stock inicial al crear producto',
            }),
          );
        }
      }

      return saved;
    });
  }

  async findAll(companyId: string, filters: FilterProductsDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.deleted_at IS NULL');

    if (filters.search)
      qb.andWhere('(p.name ILIKE :s OR p.sku ILIKE :s OR p.barcode ILIKE :s)', {
        s: `%${filters.search}%`,
      });
    if (filters.category)
      qb.andWhere('p.category = :cat', { cat: filters.category });
    if (typeof filters.is_active === 'boolean')
      qb.andWhere('p.is_active = :active', { active: filters.is_active });
    if (filters.low_stock)
      qb.andWhere('p.stock <= p.min_stock AND p.track_stock = true');

    qb.skip(skip).take(limit).orderBy('p.name', 'ASC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const product = await this.productRepo.findOne({ where: { id, company_id: companyId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async findBySku(sku: string, companyId: string) {
    const product = await this.productRepo.findOne({ where: { sku, company_id: companyId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async update(id: string, dto: UpdateProductDto, companyId: string, userId?: string) {
    const product = await this.findOne(id, companyId);

    // Only check for SKU collision if the SKU actually changed.
    if (dto.sku && dto.sku !== product.sku) {
      const collision = await this.productRepo.findOne({
        where: { sku: dto.sku, company_id: companyId },
      });
      if (collision && collision.id !== id) {
        throw new ConflictException(`Ya existe un producto con el SKU "${dto.sku}"`);
      }
    }

    const prevStock = Number(product.stock ?? 0);
    Object.assign(product, dto);
    const saved = await this.productRepo.save(product);

    // El stock que valida la venta vive en `warehouse_stocks`, NO en
    // `products.stock`. Cuando un admin edita el stock o el min_stock desde la
    // ficha del producto, espejamos el cambio en la bodega por defecto y
    // dejamos un movimiento de ajuste para no perder la trazabilidad.
    const syncStock = saved.track_stock !== false
      && (dto.stock !== undefined || dto.min_stock !== undefined);

    if (syncStock) {
      try {
        const warehouse = await this.warehousesService.getOrCreateDefault(companyId);
        const stockRepo = this.dataSource.getRepository(WarehouseStock);
        let entry = await stockRepo.findOne({
          where: { warehouse_id: warehouse.id, product_id: saved.id },
        });
        if (!entry) {
          entry = stockRepo.create({
            company_id: companyId,
            warehouse_id: warehouse.id,
            product_id: saved.id,
            stock: 0,
            min_stock: 0,
          });
        }

        const beforeWh = Number(entry.stock ?? 0);
        if (dto.stock !== undefined) entry.stock = Number(dto.stock);
        if (dto.min_stock !== undefined) entry.min_stock = Number(dto.min_stock);
        await stockRepo.save(entry);

        if (dto.stock !== undefined && Number(dto.stock) !== beforeWh) {
          const delta = Number(dto.stock) - beforeWh;
          const movRepo = this.dataSource.getRepository(InventoryMovement);
          await movRepo.save(
            movRepo.create({
              company_id: companyId,
              warehouse_id: warehouse.id,
              product_id: saved.id,
              user_id: userId,
              type: MovementType.ADJUSTMENT,
              quantity: Math.abs(delta),
              stock_before: beforeWh,
              stock_after: Number(dto.stock),
              reason: 'Ajuste manual desde la ficha del producto',
            }),
          );
        }

        // Recompute legacy product.stock = SUM(warehouse_stocks.stock) so el
        // listado de productos refleja exactamente la suma por bodega.
        await this.warehousesService.recomputeProductStock(
          this.dataSource.manager,
          saved.id,
          companyId,
        );
      } catch {
        // Soft-fail: don't break the update if WarehouseStock sync errors.
      }
    }

    return saved;
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.productRepo.softDelete(id);
    return { message: 'Producto eliminado correctamente' };
  }

  async getLowStock(companyId: string) {
    return this.productRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.stock <= p.min_stock')
      .andWhere('p.track_stock = true')
      .andWhere('p.is_active = true')
      .andWhere('p.deleted_at IS NULL')
      .orderBy('p.stock', 'ASC')
      .getMany();
  }

  async getCategories(companyId: string) {
    const result = await this.productRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.category', 'category')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.category IS NOT NULL')
      .andWhere('p.deleted_at IS NULL')
      .getRawMany();
    return result.map((r) => r.category);
  }
}
