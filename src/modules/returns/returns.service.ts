import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Return } from './entities/return.entity';
import { ReturnItem } from './entities/return-item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { WarehouseStock } from '../warehouses/entities/warehouse-stock.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { Debt } from '../debts/entities/debt.entity';
import { CreateReturnDto, FilterReturnsDto } from './dto/return.dto';
import {
  ReturnType, ReturnStatus, MovementType, DebtStatus,
} from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { WarehousesService } from '../warehouses/warehouses.service';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(Return)
    private readonly returnRepo: Repository<Return>,
    private readonly dataSource: DataSource,
    private readonly warehousesService: WarehousesService,
  ) {}

  async create(dto: CreateReturnDto, companyId: string, userId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Debes incluir al menos un producto');
    }
    if (dto.type === ReturnType.SALE_RETURN && !dto.sale_id && !dto.customer_id) {
      throw new BadRequestException(
        'Una devolución de venta requiere `sale_id` o `customer_id`',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Resolver venta (si aplica) y autocompletar campos.
      let sale: Sale | null = null;
      if (dto.sale_id) {
        sale = await manager.findOne(Sale, {
          where: { id: dto.sale_id, company_id: companyId },
          relations: ['items', 'debt'],
        });
        if (!sale) throw new NotFoundException('Venta no encontrada');
      }

      // Bodega destino (SALE_RETURN repone, DAMAGE descuenta).
      const warehouse = dto.warehouse_id
        ? await manager.findOne(Warehouse, {
            where: { id: dto.warehouse_id, company_id: companyId },
          })
        : (sale?.warehouse_id
            ? await manager.findOne(Warehouse, {
                where: { id: sale.warehouse_id, company_id: companyId },
              })
            : await this.warehousesService.getOrCreateDefault(companyId, manager));
      if (!warehouse) throw new NotFoundException('Bodega no encontrada');

      const stockRepo = manager.getRepository(WarehouseStock);

      // Construir items + calcular total.
      const items: ReturnItem[] = [];
      let total = 0;
      for (const itemDto of dto.items) {
        const product = itemDto.product_id
          ? await manager.findOne(Product, {
              where: { id: itemDto.product_id, company_id: companyId },
            })
          : null;

        const productName = product?.name ?? itemDto.product_name;
        // Precio unitario: si no se manda, usar el de la venta original
        // (si existe el item correspondiente), si no el precio actual del
        // producto, si no 0.
        let unitPrice = itemDto.unit_price ?? 0;
        if (unitPrice === 0 && sale && product) {
          const original = sale.items.find((i) => i.product_id === product.id);
          if (original) unitPrice = Number(original.unit_price);
          else if (product.price) unitPrice = Number(product.price);
        } else if (unitPrice === 0 && product?.price) {
          unitPrice = Number(product.price);
        }

        const subtotal = unitPrice * itemDto.quantity;
        total += subtotal;

        items.push(manager.create(ReturnItem, {
          product_id: product?.id ?? null,
          product_name: productName,
          quantity: itemDto.quantity,
          unit_price: unitPrice,
          subtotal,
          reason: itemDto.reason ?? null,
        }));
      }

      const ret = manager.create(Return, {
        company_id: companyId,
        type: dto.type,
        status: ReturnStatus.COMPLETED,
        sale_id: sale?.id ?? null,
        customer_id: dto.customer_id ?? sale?.customer_id ?? null,
        warehouse_id: warehouse.id,
        user_id: userId,
        reason: dto.reason ?? null,
        notes: dto.notes ?? null,
        total_amount: dto.type === ReturnType.SALE_RETURN ? total : 0,
        items,
      });
      await manager.save(ret);

      // Aplicar efecto al inventario.
      //   SALE_RETURN → IN (repone)
      //   DAMAGE      → OUT (descuenta)
      const isReturn = dto.type === ReturnType.SALE_RETURN;
      for (const it of items) {
        if (!it.product_id) continue;
        const product = await manager.findOne(Product, {
          where: { id: it.product_id, company_id: companyId },
        });
        if (!product?.track_stock) continue;

        let entry = await stockRepo.findOne({
          where: { warehouse_id: warehouse.id, product_id: it.product_id },
        });
        const before = entry?.stock ?? 0;
        const after = isReturn ? before + it.quantity : before - it.quantity;

        if (!isReturn && after < 0) {
          throw new BadRequestException(
            `No hay stock suficiente en "${warehouse.name}" para registrar la avería de "${it.product_name}" (disponible: ${before}, solicitado: ${it.quantity})`,
          );
        }

        if (entry) {
          entry.stock = after;
          await stockRepo.save(entry);
        } else {
          entry = stockRepo.create({
            company_id: companyId,
            warehouse_id: warehouse.id,
            product_id: it.product_id,
            stock: after,
            min_stock: 0,
          });
          await stockRepo.save(entry);
        }

        await manager.save(
          manager.create(InventoryMovement, {
            company_id: companyId,
            product_id: it.product_id,
            user_id: userId,
            warehouse_id: warehouse.id,
            type: isReturn ? MovementType.IN : MovementType.OUT,
            quantity: it.quantity,
            stock_before: before,
            stock_after: after,
            reason: isReturn
              ? `Devolución venta ${sale?.invoice_number ?? ''}`.trim()
              : `Avería / merma: ${dto.reason ?? 'sin detalle'}`,
          }),
        );

        await this.warehousesService.recomputeProductStock(
          manager, it.product_id, companyId,
        );
      }

      // Si la devolución viene de una venta a crédito con deuda activa,
      // reducimos el saldo restante para reflejar el reembolso.
      if (isReturn && sale?.debt && total > 0) {
        const debt = sale.debt;
        const remaining = Math.max(0, Number(debt.remaining_amount) - total);
        debt.remaining_amount = remaining;
        if (remaining === 0) debt.status = DebtStatus.PAID;
        await manager.save(debt);
      }

      return manager.findOne(Return, {
        where: { id: ret.id },
        relations: ['items', 'customer', 'warehouse', 'sale', 'user'],
      });
    });
  }

  async findAll(companyId: string, filters: FilterReturnsDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.returnRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.customer', 'c')
      .leftJoinAndSelect('r.warehouse', 'w')
      .leftJoinAndSelect('r.sale', 's')
      .leftJoinAndSelect('r.user', 'u')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.deleted_at IS NULL');

    if (filters.type) qb.andWhere('r.type = :type', { type: filters.type });
    if (filters.customer_id) qb.andWhere('r.customer_id = :cid', { cid: filters.customer_id });
    if (filters.warehouse_id) qb.andWhere('r.warehouse_id = :wid', { wid: filters.warehouse_id });
    if (filters.search)
      qb.andWhere('(r.reason ILIKE :s OR r.notes ILIKE :s)', { s: `%${filters.search}%` });
    if (filters.date_from) qb.andWhere('r.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('r.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('r.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const ret = await this.returnRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['items', 'items.product', 'customer', 'warehouse', 'sale', 'user'],
    });
    if (!ret) throw new NotFoundException('Devolución no encontrada');
    return ret;
  }
}
