import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseStock } from './entities/warehouse-stock.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import {
  CreateWarehouseDto, UpdateWarehouseDto,
  AdjustWarehouseStockDto, TransferStockDto,
} from './dto/warehouse.dto';
import { MovementType } from '../../common/types/enums';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(WarehouseStock)
    private readonly stockRepo: Repository<WarehouseStock>,
    private readonly dataSource: DataSource,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Bodegas
  // ───────────────────────────────────────────────────────────────────────────

  async create(dto: CreateWarehouseDto, companyId: string) {
    const code = dto.code.toUpperCase();
    const existing = await this.warehouseRepo.findOne({
      where: { company_id: companyId, code },
    });
    if (existing) throw new ConflictException(`Ya existe una bodega con el código "${code}"`);

    const warehouse = this.warehouseRepo.create({
      ...dto,
      code,
      company_id: companyId,
      is_default: false,
    });
    return this.warehouseRepo.save(warehouse);
  }

  async findAll(companyId: string) {
    return this.warehouseRepo
      .createQueryBuilder('w')
      .loadRelationCountAndMap('w.products_count', 'w.stocks')
      .where('w.company_id = :companyId', { companyId })
      .andWhere('w.deleted_at IS NULL')
      .orderBy('w.is_default', 'DESC')
      .addOrderBy('w.name', 'ASC')
      .getMany();
  }

  async findOne(id: string, companyId: string) {
    const warehouse = await this.warehouseRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');
    return warehouse;
  }

  /** Devuelve la bodega por defecto, creándola lazy si por algún motivo falta. */
  async getOrCreateDefault(companyId: string, manager: EntityManager = this.dataSource.manager) {
    const repo = manager.getRepository(Warehouse);

    let wh = await repo.findOne({
      where: { company_id: companyId, is_default: true },
    });
    if (wh) return wh;

    // No hay default: si ya existe una bodega (cualquiera) la promovemos.
    wh = await repo.findOne({
      where: { company_id: companyId },
      order: { created_at: 'ASC' },
    });
    if (wh) {
      wh.is_default = true;
      return repo.save(wh);
    }

    // Si llegamos aquí, no hay bodega activa. Puede haber una soft-eliminada
    // con code='PRINCIPAL' que choque con la unique constraint, así que la
    // restauramos en lugar de insertar una nueva.
    const deleted = await repo.findOne({
      where: { company_id: companyId, code: 'PRINCIPAL' },
      withDeleted: true,
    });
    if (deleted) {
      deleted.deleted_at = null as any;
      deleted.is_default = true;
      deleted.is_active = true;
      deleted.is_sellable = true;
      deleted.name = deleted.name ?? 'Bodega Principal';
      return repo.save(deleted);
    }

    return repo.save(repo.create({
      company_id: companyId,
      name: 'Bodega Principal',
      code: 'PRINCIPAL',
      is_default: true,
      is_sellable: true,
      is_active: true,
    }));
  }

  async update(id: string, dto: UpdateWarehouseDto, companyId: string) {
    const warehouse = await this.findOne(id, companyId);
    if (dto.code) {
      const code = dto.code.toUpperCase();
      if (code !== warehouse.code) {
        const dup = await this.warehouseRepo.findOne({ where: { company_id: companyId, code } });
        if (dup) throw new ConflictException(`Ya existe una bodega con el código "${code}"`);
        warehouse.code = code;
      }
    }
    Object.assign(warehouse, { ...dto, code: warehouse.code });
    return this.warehouseRepo.save(warehouse);
  }

  async remove(id: string, companyId: string) {
    const warehouse = await this.findOne(id, companyId);
    if (warehouse.is_default) {
      throw new BadRequestException('No se puede eliminar la bodega principal');
    }
    const totalStock = await this.stockRepo
      .createQueryBuilder('s')
      .where('s.warehouse_id = :id', { id })
      .andWhere('s.stock > 0')
      .getCount();
    if (totalStock > 0) {
      throw new BadRequestException(
        'La bodega tiene productos con stock. Transfiéralos antes de eliminarla.',
      );
    }
    await this.warehouseRepo.softDelete(id);
    return { message: 'Bodega eliminada' };
  }

  /** Marca otra bodega como la principal y desmarca la anterior (transaccional). */
  async setDefault(id: string, companyId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Warehouse);
      const wh = await repo.findOne({ where: { id, company_id: companyId } });
      if (!wh) throw new NotFoundException('Bodega no encontrada');

      await repo.update({ company_id: companyId, is_default: true }, { is_default: false });
      wh.is_default = true;
      await repo.save(wh);
      return wh;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Stock por bodega
  // ───────────────────────────────────────────────────────────────────────────

  async listStock(warehouseId: string, companyId: string) {
    await this.findOne(warehouseId, companyId);
    return this.stockRepo
      .createQueryBuilder('s')
      .leftJoin('s.product', 'p')
      .select([
        // Sin `s.product_id`/`s.warehouse_id` el frontend no podía distinguir
        // los items (todos llegaban con product_id=undefined) y el dropdown
        // de transferencia los trataba como uno solo.
        's.id', 's.product_id', 's.warehouse_id',
        's.stock', 's.min_stock', 's.updated_at',
        'p.id', 'p.name', 'p.sku', 'p.price', 'p.unit', 'p.is_active',
      ])
      .where('s.warehouse_id = :wid', { wid: warehouseId })
      .andWhere('s.company_id = :cid', { cid: companyId })
      .orderBy('p.name', 'ASC')
      .getMany();
  }

  /** Setea el stock absoluto de un producto en una bodega + registra movimiento. */
  async adjustStock(
    warehouseId: string,
    dto: AdjustWarehouseStockDto,
    companyId: string,
    userId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const wh = await manager.findOne(Warehouse, {
        where: { id: warehouseId, company_id: companyId },
      });
      if (!wh) throw new NotFoundException('Bodega no encontrada');
      const product = await manager.findOne(Product, {
        where: { id: dto.product_id, company_id: companyId },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');

      const stockRepo = manager.getRepository(WarehouseStock);
      let entry = await stockRepo.findOne({
        where: { warehouse_id: warehouseId, product_id: dto.product_id },
      });

      const stockBefore = entry?.stock ?? 0;
      const stockAfter = dto.stock;
      const delta = stockAfter - stockBefore;

      if (entry) {
        entry.stock = stockAfter;
        if (dto.min_stock !== undefined) entry.min_stock = dto.min_stock;
        await stockRepo.save(entry);
      } else {
        entry = stockRepo.create({
          company_id: companyId,
          warehouse_id: warehouseId,
          product_id: dto.product_id,
          stock: stockAfter,
          min_stock: dto.min_stock ?? 0,
        });
        await stockRepo.save(entry);
      }

      // Sincronizamos Product.stock = SUM(stock por bodega)
      await this.recomputeProductStock(manager, dto.product_id, companyId);

      // Registramos movimiento (IN/OUT/ADJUSTMENT según delta)
      if (delta !== 0) {
        const type =
          delta > 0 ? MovementType.IN
          : MovementType.OUT;
        await manager.save(
          manager.create(InventoryMovement, {
            company_id: companyId,
            product_id: dto.product_id,
            user_id: userId,
            warehouse_id: warehouseId,
            type: delta === 0 ? MovementType.ADJUSTMENT : type,
            quantity: Math.abs(delta),
            stock_before: stockBefore,
            stock_after: stockAfter,
            reason: dto.reason ?? `Ajuste manual en bodega ${wh.name}`,
          }),
        );
      }

      return entry;
    });
  }

  async transfer(dto: TransferStockDto, companyId: string, userId: string) {
    if (dto.from_warehouse_id === dto.to_warehouse_id) {
      throw new BadRequestException('La bodega origen y destino no pueden ser la misma');
    }
    return this.dataSource.transaction(async (manager) => {
      const stockRepo = manager.getRepository(WarehouseStock);

      const from = await manager.findOne(Warehouse, {
        where: { id: dto.from_warehouse_id, company_id: companyId },
      });
      const to = await manager.findOne(Warehouse, {
        where: { id: dto.to_warehouse_id, company_id: companyId },
      });
      if (!from || !to) throw new NotFoundException('Bodega no encontrada');

      const fromEntry = await stockRepo.findOne({
        where: { warehouse_id: from.id, product_id: dto.product_id },
      });
      if (!fromEntry || fromEntry.stock < dto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente en bodega "${from.name}" (disponible: ${fromEntry?.stock ?? 0})`,
        );
      }

      let toEntry = await stockRepo.findOne({
        where: { warehouse_id: to.id, product_id: dto.product_id },
      });
      if (!toEntry) {
        toEntry = stockRepo.create({
          company_id: companyId,
          warehouse_id: to.id,
          product_id: dto.product_id,
          stock: 0,
          min_stock: 0,
        });
      }

      const fromBefore = fromEntry.stock;
      const toBefore = toEntry.stock;
      fromEntry.stock = fromBefore - dto.quantity;
      toEntry.stock = toBefore + dto.quantity;
      await stockRepo.save([fromEntry, toEntry]);

      const movements = [
        manager.create(InventoryMovement, {
          company_id: companyId,
          product_id: dto.product_id,
          user_id: userId,
          warehouse_id: from.id,
          type: MovementType.TRANSFER_OUT,
          quantity: dto.quantity,
          stock_before: fromBefore,
          stock_after: fromEntry.stock,
          reason: dto.reason ?? `Transferencia hacia ${to.name}`,
        }),
        manager.create(InventoryMovement, {
          company_id: companyId,
          product_id: dto.product_id,
          user_id: userId,
          warehouse_id: to.id,
          type: MovementType.TRANSFER_IN,
          quantity: dto.quantity,
          stock_before: toBefore,
          stock_after: toEntry.stock,
          reason: dto.reason ?? `Transferencia desde ${from.name}`,
        }),
      ];
      await manager.save(movements);

      // Total no cambia, pero recomputamos para consistencia.
      await this.recomputeProductStock(manager, dto.product_id, companyId);

      return { message: 'Transferencia realizada', from: fromEntry, to: toEntry };
    });
  }

  /**
   * Recalcula `Product.stock` como la suma del stock de TODAS las bodegas
   * (sin filtrar por is_sellable: el campo refleja el stock total en bodega).
   */
  async recomputeProductStock(manager: EntityManager, productId: string, companyId: string) {
    const result = await manager
      .createQueryBuilder(WarehouseStock, 's')
      .select('COALESCE(SUM(s.stock), 0)', 'total')
      .where('s.product_id = :pid', { pid: productId })
      .andWhere('s.company_id = :cid', { cid: companyId })
      .getRawOne<{ total: string }>();
    const total = Number(result?.total ?? 0);
    await manager.update(Product, { id: productId, company_id: companyId }, { stock: total });
    return total;
  }
}
