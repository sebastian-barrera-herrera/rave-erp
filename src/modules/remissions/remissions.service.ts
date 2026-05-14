import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Remission } from './entities/remission.entity';
import { RemissionItem } from './entities/remission-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Company } from '../companies/entities/company.entity';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { WarehouseStock } from '../warehouses/entities/warehouse-stock.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { CreateRemissionDto, FilterRemissionsDto } from './dto/remission.dto';
import { RemissionStatus, MovementType } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { WarehousesService } from '../warehouses/warehouses.service';
import { PdfService } from '../pdf/pdf.service';

@Injectable()
export class RemissionsService {
  private readonly logger = new Logger(RemissionsService.name);

  constructor(
    @InjectRepository(Remission)
    private readonly remissionRepo: Repository<Remission>,
    private readonly dataSource: DataSource,
    private readonly warehousesService: WarehousesService,
    private readonly pdfService: PdfService,
  ) {}

  async create(dto: CreateRemissionDto, companyId: string, userId: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('La remisión debe tener al menos una línea');
    }

    return this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customer_id, company_id: companyId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      // Bodega: usa la enviada o la principal de la empresa.
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
      const items: RemissionItem[] = [];

      // Validamos stock y descontamos por línea (track_stock=true)
      for (const itemDto of dto.items) {
        let resolvedName = itemDto.product_name;
        let unit = itemDto.unit ?? 'unidad';
        let unitPrice = itemDto.unit_price ?? 0;

        if (!itemDto.product_id && !resolvedName?.trim()) {
          throw new BadRequestException(
            'Cada línea libre debe incluir un product_name descriptivo.',
          );
        }

        if (itemDto.product_id) {
          const product = await manager.findOne(Product, {
            where: { id: itemDto.product_id, company_id: companyId },
          });
          if (!product) {
            throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);
          }
          if (!product.is_active) {
            throw new BadRequestException(`El producto "${product.name}" está inactivo`);
          }
          resolvedName = resolvedName || product.name;
          unit = itemDto.unit ?? product.unit;
          unitPrice = itemDto.unit_price ?? Number(product.price);

          if (product.track_stock) {
            const stockEntry = await stockRepo.findOne({
              where: { warehouse_id: warehouse.id, product_id: product.id },
            });
            const available = stockEntry?.stock ?? 0;
            if (available < itemDto.quantity) {
              throw new BadRequestException(
                `Stock insuficiente en bodega "${warehouse.name}" para "${product.name}". `
                + `Disponible: ${available}, solicitado: ${itemDto.quantity}`,
              );
            }
            const before = stockEntry!.stock;
            stockEntry!.stock = before - itemDto.quantity;
            await stockRepo.save(stockEntry!);

            await manager.save(
              manager.create(InventoryMovement, {
                company_id: companyId,
                product_id: product.id,
                user_id: userId,
                warehouse_id: warehouse.id,
                type: MovementType.OUT,
                quantity: itemDto.quantity,
                stock_before: before,
                stock_after: stockEntry!.stock,
                reason: `Remisión a ${customer.name}`,
              }),
            );

            await this.warehousesService.recomputeProductStock(manager, product.id, companyId);
          }
        }

        items.push(
          manager.create(RemissionItem, {
            product_id: itemDto.product_id ?? null,
            product_name: resolvedName,
            description: itemDto.description,
            quantity: itemDto.quantity,
            unit,
            unit_price: unitPrice,
          }),
        );
      }

      const remission_number = await this.generateRemissionNumber(manager, companyId);

      const remission = manager.create(Remission, {
        company_id: companyId,
        remission_number,
        customer_id: dto.customer_id,
        user_id: userId,
        warehouse_id: warehouse.id,
        status: RemissionStatus.ISSUED,
        description: dto.description,
        notes: dto.notes,
        items,
      });
      await manager.save(remission);

      return manager.findOne(Remission, {
        where: { id: remission.id },
        relations: ['customer', 'user', 'warehouse', 'items', 'items.product'],
      });
    });
  }

  async findAll(companyId: string, filters: FilterRemissionsDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);

    const qb = this.remissionRepo
      .createQueryBuilder('r')
      .leftJoin('r.customer', 'c')
      .leftJoin('r.user', 'u')
      .leftJoin('r.warehouse', 'w')
      .select([
        'r.id', 'r.remission_number', 'r.status', 'r.description',
        'r.created_at',
        'c.id', 'c.name',
        'u.id', 'u.name',
        'w.id', 'w.name',
      ])
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.deleted_at IS NULL');

    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('r.customer_id = :cid', { cid: filters.customer_id });
    if (filters.warehouse_id) qb.andWhere('r.warehouse_id = :wid', { wid: filters.warehouse_id });
    if (filters.user_id) qb.andWhere('r.user_id = :uid', { uid: filters.user_id });
    if (filters.search) qb.andWhere('r.remission_number ILIKE :s', { s: `%${filters.search}%` });
    if (filters.date_from) qb.andWhere('r.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('r.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip((page - 1) * limit).take(limit).orderBy('r.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const remission = await this.remissionRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['customer', 'user', 'warehouse', 'items', 'items.product'],
    });
    if (!remission) throw new NotFoundException('Remisión no encontrada');
    return remission;
  }

  /**
   * Cancela y restaura stock de los productos rastreables en la bodega original.
   * Si la remisión ya estaba cancelada, falla.
   */
  async cancel(id: string, companyId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const remission = await manager.findOne(Remission, {
        where: { id, company_id: companyId },
        relations: ['items'],
      });
      if (!remission) throw new NotFoundException('Remisión no encontrada');
      if (remission.status === RemissionStatus.CANCELED) {
        throw new BadRequestException('La remisión ya está cancelada');
      }

      const stockRepo = manager.getRepository(WarehouseStock);
      for (const item of remission.items) {
        if (!item.product_id || !remission.warehouse_id) continue;
        const product = await manager.findOne(Product, { where: { id: item.product_id } });
        if (!product?.track_stock) continue;

        const stockEntry = await stockRepo.findOne({
          where: { warehouse_id: remission.warehouse_id, product_id: item.product_id },
        });
        const before = stockEntry?.stock ?? 0;
        if (stockEntry) {
          stockEntry.stock = before + item.quantity;
          await stockRepo.save(stockEntry);
        } else {
          await stockRepo.save(stockRepo.create({
            company_id: companyId,
            warehouse_id: remission.warehouse_id,
            product_id: item.product_id,
            stock: item.quantity,
            min_stock: 0,
          }));
        }

        await manager.save(
          manager.create(InventoryMovement, {
            company_id: companyId,
            product_id: item.product_id,
            user_id: userId,
            warehouse_id: remission.warehouse_id,
            type: MovementType.IN,
            quantity: item.quantity,
            stock_before: before,
            stock_after: before + item.quantity,
            reason: `Cancelación remisión ${remission.remission_number}`,
          }),
        );

        await this.warehousesService.recomputeProductStock(manager, item.product_id, companyId);
      }

      remission.status = RemissionStatus.CANCELED;
      await manager.save(remission);
      return { message: 'Remisión cancelada y stock revertido' };
    });
  }

  async generatePdf(id: string, companyId: string): Promise<Buffer> {
    const remission = await this.findOne(id, companyId);
    const company = await this.dataSource
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return this.pdfService.generateRemission(remission, company);
  }

  /**
   * `REM-{YYYY}-{6 dígitos secuenciales por empresa}`. Usa el conteo total
   * de remisiones de la empresa (incluye canceladas) — número siempre crece.
   */
  private async generateRemissionNumber(manager: any, companyId: string): Promise<string> {
    const count = await manager.count(Remission, { where: { company_id: companyId } });
    const year = new Date().getFullYear();
    return `REM-${year}-${String(count + 1).padStart(6, '0')}`;
  }
}
