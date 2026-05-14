import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { WarehouseStock } from '../warehouses/entities/warehouse-stock.entity';
import { WarehousesService } from '../warehouses/warehouses.service';
import { AdjustInventoryDto, FilterMovementsDto } from './dto/inventory.dto';
import { MovementType } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly warehousesService: WarehousesService,
  ) {}

  /**
   * Ajuste manual de stock — opera SIEMPRE contra una bodega:
   *   - IN          → stock += quantity en la bodega indicada
   *   - OUT         → stock -= quantity (falla si stock < quantity)
   *   - ADJUSTMENT  → stock = quantity (fija el stock absoluto en esa bodega)
   *   - TRANSFER_*  → no se permiten aquí; se hacen vía /warehouses/transfer
   *
   * Después de mutar `WarehouseStock`, recomputamos `Product.stock` como
   * suma de todas las bodegas para mantener compatibilidad con queries
   * que aún leen del campo plano.
   */
  async adjust(dto: AdjustInventoryDto, companyId: string, userId: string) {
    if (dto.type === MovementType.TRANSFER_IN || dto.type === MovementType.TRANSFER_OUT) {
      throw new BadRequestException(
        'Las transferencias entre bodegas se gestionan en /warehouses/transfer',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: { id: dto.product_id, company_id: companyId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');
      if (!product.track_stock) {
        throw new BadRequestException('Este producto no tiene control de stock');
      }

      const warehouse = dto.warehouse_id
        ? await manager.findOne(Warehouse, {
            where: { id: dto.warehouse_id, company_id: companyId },
          })
        : await this.warehousesService.getOrCreateDefault(companyId, manager);
      if (!warehouse) throw new NotFoundException('Bodega no encontrada');
      if (!warehouse.is_active) {
        throw new BadRequestException(`La bodega "${warehouse.name}" está inactiva`);
      }

      const stockRepo = manager.getRepository(WarehouseStock);
      let entry = await stockRepo.findOne({
        where: { warehouse_id: warehouse.id, product_id: product.id },
      });
      if (!entry) {
        entry = stockRepo.create({
          company_id: companyId,
          warehouse_id: warehouse.id,
          product_id: product.id,
          stock: 0,
          min_stock: 0,
        });
      }

      const stockBefore = entry.stock;
      let stockAfter = stockBefore;

      if (dto.type === MovementType.IN) {
        stockAfter = stockBefore + dto.quantity;
      } else if (dto.type === MovementType.OUT) {
        if (dto.quantity > stockBefore) {
          throw new BadRequestException(
            `Stock insuficiente en bodega "${warehouse.name}". `
            + `Disponible: ${stockBefore}, solicitado: ${dto.quantity}`,
          );
        }
        stockAfter = stockBefore - dto.quantity;
      } else if (dto.type === MovementType.ADJUSTMENT) {
        // ADJUSTMENT fija el stock absoluto al valor `quantity`.
        stockAfter = dto.quantity;
      }

      entry.stock = stockAfter;
      await stockRepo.save(entry);

      await this.warehousesService.recomputeProductStock(manager, product.id, companyId);

      const movement = manager.create(InventoryMovement, {
        company_id: companyId,
        product_id: dto.product_id,
        user_id: userId,
        warehouse_id: warehouse.id,
        type: dto.type,
        quantity: Math.abs(stockAfter - stockBefore) || dto.quantity,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reason: dto.reason,
        reference: dto.reference,
      });
      return manager.save(movement);
    });
  }

  async findAll(companyId: string, filters: FilterMovementsDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Listado: solo id+nombre/sku del producto, id+nombre del usuario y la bodega.
    const qb = this.movementRepo
      .createQueryBuilder('m')
      .leftJoin('m.product', 'p')
      .leftJoin('m.user', 'u')
      .leftJoin('m.warehouse', 'w')
      .select([
        'm.id', 'm.type', 'm.quantity', 'm.stock_before', 'm.stock_after',
        'm.reason', 'm.reference', 'm.created_at',
        'p.id', 'p.name', 'p.sku',
        'u.id', 'u.name',
        'w.id', 'w.name',
      ])
      .where('m.company_id = :companyId', { companyId });

    if (filters.product_id) qb.andWhere('m.product_id = :pid', { pid: filters.product_id });
    if (filters.warehouse_id) qb.andWhere('m.warehouse_id = :wid', { wid: filters.warehouse_id });
    if (filters.user_id) qb.andWhere('m.user_id = :uid', { uid: filters.user_id });
    if (filters.type) qb.andWhere('m.type = :type', { type: filters.type });
    if (filters.date_from) qb.andWhere('m.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('m.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('m.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findByProduct(productId: string, companyId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId, company_id: companyId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    return this.movementRepo
      .createQueryBuilder('m')
      .leftJoin('m.user', 'u')
      .leftJoin('m.warehouse', 'w')
      .select([
        'm.id', 'm.type', 'm.quantity', 'm.stock_before', 'm.stock_after',
        'm.reason', 'm.reference', 'm.created_at',
        'u.id', 'u.name',
        'w.id', 'w.name',
      ])
      .where('m.product_id = :pid', { pid: productId })
      .andWhere('m.company_id = :cid', { cid: companyId })
      .orderBy('m.created_at', 'DESC')
      .take(50)
      .getMany();
  }
}
