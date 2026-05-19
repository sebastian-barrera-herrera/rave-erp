import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Company } from '../companies/entities/company.entity';
import { Debt } from '../debts/entities/debt.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { WarehouseStock } from '../warehouses/entities/warehouse-stock.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { CreateSaleDto, FilterSalesDto, SendSaleDto } from './dto/sale.dto';
import {
  SaleType, SaleStatus, DebtStatus, MovementType, PaymentMethod,
} from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { PdfService } from '../pdf/pdf.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { MailService } from '../../shared/services/mail.service';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    private readonly dataSource: DataSource,
    private readonly pdfService: PdfService,
    private readonly warehousesService: WarehousesService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateSaleDto, companyId: string, userId: string) {
    if (dto.type === SaleType.CREDIT && !dto.due_date) {
      throw new BadRequestException('Las ventas a crédito requieren una fecha de vencimiento');
    }
    if (dto.down_payment && dto.down_payment > 0 && dto.type !== SaleType.CREDIT) {
      throw new BadRequestException('El anticipo solo aplica a ventas a crédito');
    }

    const MAX_RETRIES = 5;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.createOnce(dto, companyId, userId, attempt);
      } catch (err: any) {
        const isDuplicate =
          err?.code === '23505' ||
          /duplicate key value/i.test(err?.message ?? '') ||
          /invoice_number/i.test(err?.message ?? '');
        if (isDuplicate && attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 80 + attempt * 60));
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private async createOnce(
    dto: CreateSaleDto,
    companyId: string,
    userId: string,
    attempt: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const company = await manager.findOne(Company, { where: { id: companyId } });
      if (!company) throw new NotFoundException('Empresa no encontrada');
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customer_id, company_id: companyId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      // Resolución de bodega:
      //  - Si el usuario pasó `warehouse_id`, respetamos esa selección.
      //  - Si no, buscamos automáticamente la primera bodega vendible activa
      //    que tenga stock suficiente para TODOS los items con track_stock.
      //    Esto evita el "stock insuficiente" cuando el inventario total
      //    muestra 20 pero la bodega principal está vacía (típico cuando
      //    el usuario ajustó stock en otra bodega).
      //  - Si tampoco hay ninguna, caemos a la principal y emitimos un
      //    error claro indicando dónde sí hay stock disponible.
      const stockRepo = manager.getRepository(WarehouseStock);
      const trackedItems = await this.collectTrackedItems(manager, companyId, dto.items);

      let warehouse: Warehouse | null;
      if (dto.warehouse_id) {
        warehouse = await manager.findOne(Warehouse, {
          where: { id: dto.warehouse_id, company_id: companyId },
        });
      } else {
        warehouse = await this.pickWarehouseWithStock(manager, companyId, trackedItems)
          ?? await this.warehousesService.getOrCreateDefault(companyId, manager);
      }
      if (!warehouse) throw new NotFoundException('Bodega no encontrada');
      if (!warehouse.is_active) {
        throw new BadRequestException(`La bodega "${warehouse.name}" está inactiva`);
      }
      if (!warehouse.is_sellable) {
        throw new BadRequestException(
          `La bodega "${warehouse.name}" no es de venta (is_sellable=false)`,
        );
      }

      // Validación de stock por bodega (track_stock=true). Si falla, le
      // decimos al usuario exactamente en qué otras bodegas SÍ hay stock
      // disponible para que pueda transferir o cambiar la bodega de venta.
      const stockEntries: Map<string, WarehouseStock | null> = new Map();
      for (const tracked of trackedItems) {
        const entry = await stockRepo.findOne({
          where: { warehouse_id: warehouse.id, product_id: tracked.product.id },
        });
        const available = entry?.stock ?? 0;
        if (available < tracked.quantity) {
          const otherStock = await stockRepo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.warehouse', 'w')
            .where('s.product_id = :pid', { pid: tracked.product.id })
            .andWhere('s.company_id = :cid', { cid: companyId })
            .andWhere('s.stock > 0')
            .andWhere('s.warehouse_id != :wid', { wid: warehouse.id })
            .orderBy('s.stock', 'DESC')
            .getMany();
          const hint = otherStock.length
            ? ' Disponible en: '
              + otherStock
                .map((s) => `${s.warehouse?.name ?? s.warehouse_id} (${s.stock})`)
                .join(', ')
              + '. Transfiere stock o selecciona otra bodega al vender.'
            : '';
          throw new BadRequestException(
            `Stock insuficiente en bodega "${warehouse.name}" para "${tracked.product.name}". `
            + `Disponible: ${available}, solicitado: ${tracked.quantity}.${hint}`,
          );
        }
        stockEntries.set(tracked.product.id, entry);
      }

      // Validamos productos no rastreados (existencia + activo).
      for (const itemDto of dto.items) {
        if (trackedItems.some((t) => t.product.id === itemDto.product_id)) continue;
        const product = await manager.findOne(Product, {
          where: { id: itemDto.product_id, company_id: companyId },
        });
        if (!product) throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);
        if (!product.is_active) {
          throw new BadRequestException(`El producto "${product.name}" no está activo`);
        }
      }

      // Construcción de items + cálculo de totales
      const saleItems: SaleItem[] = [];
      let subtotal = 0;

      for (const itemDto of dto.items) {
        const product = await manager.findOne(Product, {
          where: { id: itemDto.product_id, company_id: companyId },
        });
        if (!product) throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);

        const unitPrice = itemDto.unit_price ?? Number(product.price);
        const itemDiscount = itemDto.discount ?? 0;
        const itemSubtotal = (unitPrice * itemDto.quantity) - itemDiscount;

        saleItems.push(manager.create(SaleItem, {
          product_id: itemDto.product_id,
          product_name: product.name,
          quantity: itemDto.quantity,
          unit_price: unitPrice,
          discount: itemDiscount,
          subtotal: itemSubtotal,
        }));
        subtotal += itemSubtotal;
      }

      const globalDiscount = dto.discount ?? 0;
      const taxableAmount = subtotal - globalDiscount;
      // Allow per-sale tax override (e.g. 0 to skip IVA on this transaction).
      const effectiveTaxRate =
        dto.tax_rate !== undefined && dto.tax_rate !== null
          ? Number(dto.tax_rate)
          : Number(company.tax_rate);
      const taxAmount = taxableAmount * effectiveTaxRate;
      const total = taxableAmount + taxAmount;

      const downPayment = Number(dto.down_payment ?? 0);
      if (downPayment > total) {
        throw new BadRequestException(
          `El anticipo (${downPayment}) supera el total de la venta (${total.toFixed(2)})`,
        );
      }

      const invoiceNumber = await this.generateInvoiceNumber(manager, companyId, attempt);

      const sale = manager.create(Sale, {
        customer_id: dto.customer_id,
        user_id: userId,
        warehouse_id: warehouse.id,
        invoice_number: invoiceNumber,
        type: dto.type,
        status: SaleStatus.COMPLETED,
        subtotal,
        tax_amount: taxAmount,
        discount: globalDiscount,
        total,
        down_payment: downPayment,
        // Para CASH se persiste el método con el que el cliente pagó.
        // Para CREDIT solo si hubo anticipo — el resto se cobra después
        // como Payment con su propio método.
        payment_method:
          dto.type === SaleType.CASH
            ? (dto.down_payment_method ?? PaymentMethod.CASH)
            : downPayment > 0
              ? (dto.down_payment_method ?? PaymentMethod.CASH)
              : null,
        payment_reference: dto.payment_reference ?? null,
        items: saleItems,
      });
      sale.company_id = companyId;
      if (dto.notes) sale.notes = dto.notes;
      if (dto.due_date) sale.due_date = new Date(dto.due_date);
      await manager.save(sale);

      // Descontar stock + movimientos
      for (const itemDto of dto.items) {
        const product = await manager.findOne(Product, {
          where: { id: itemDto.product_id, company_id: companyId },
        });
        if (!product?.track_stock) continue;

        const entry = stockEntries.get(product.id)!;
        const before = entry.stock;
        entry.stock = before - itemDto.quantity;
        await stockRepo.save(entry);

        await manager.save(
          manager.create(InventoryMovement, {
            company_id: companyId,
            product_id: itemDto.product_id,
            user_id: userId,
            sale_id: sale.id,
            warehouse_id: warehouse.id,
            type: MovementType.OUT,
            quantity: itemDto.quantity,
            stock_before: before,
            stock_after: entry.stock,
            reason: `Venta ${invoiceNumber}`,
          }),
        );

        await this.warehousesService.recomputeProductStock(manager, product.id, companyId);
      }

      // Crédito: crear deuda y, si hay anticipo, registrarlo como Payment
      if (dto.type === SaleType.CREDIT && dto.due_date) {
        const remaining = total - downPayment;
        const debtStatus = remaining <= 0
          ? DebtStatus.PAID
          : downPayment > 0 ? DebtStatus.PARTIAL : DebtStatus.PENDING;

        const debt = await manager.save(
          manager.create(Debt, {
            company_id: companyId,
            sale_id: sale.id,
            customer_id: dto.customer_id,
            total_amount: total,
            paid_amount: downPayment,
            remaining_amount: Math.max(remaining, 0),
            status: debtStatus,
            due_date: new Date(dto.due_date),
          }),
        );

        if (downPayment > 0) {
          await manager.save(
            manager.create(Payment, {
              company_id: companyId,
              debt_id: debt.id,
              user_id: userId,
              amount: downPayment,
              method: dto.down_payment_method ?? PaymentMethod.CASH,
              reference: dto.payment_reference ?? undefined,
              notes: `Anticipo al momento de la venta ${invoiceNumber}`,
            }),
          );
        }
      }

      return manager.findOne(Sale, {
        where: { id: sale.id },
        relations: ['customer', 'user', 'warehouse', 'items', 'debt'],
      });
    });
  }

  async findAll(companyId: string, filters: FilterSalesDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Listado: incluimos `debt` (status + remaining + due_date) para que el
    // frontend pueda pintar el badge "Vencida" en ventas a crédito cuya
    // deuda asociada esté en mora. Sin estos campos el frontend solo veía
    // status=COMPLETED y la vencida quedaba indistinguible de una completada.
    const qb = this.saleRepo
      .createQueryBuilder('s')
      .leftJoin('s.customer', 'c')
      .leftJoin('s.user', 'u')
      .leftJoin('s.warehouse', 'w')
      .leftJoin('s.debt', 'd')
      .select([
        's.id', 's.invoice_number', 's.type', 's.status',
        's.subtotal', 's.tax_amount', 's.discount', 's.total',
        's.down_payment', 's.due_date', 's.created_at',
        'c.id', 'c.name',
        'u.id', 'u.name',
        'w.id', 'w.name',
        'd.id', 'd.status', 'd.remaining_amount', 'd.paid_amount',
        'd.due_date', 'd.total_amount',
      ])
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.deleted_at IS NULL');

    if (filters.type) qb.andWhere('s.type = :type', { type: filters.type });
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('s.customer_id = :cid', { cid: filters.customer_id });
    if (filters.user_id) qb.andWhere('s.user_id = :uid', { uid: filters.user_id });
    if (filters.warehouse_id) qb.andWhere('s.warehouse_id = :wid', { wid: filters.warehouse_id });
    if (filters.search) qb.andWhere('s.invoice_number ILIKE :s', { s: `%${filters.search}%` });
    if (filters.date_from) qb.andWhere('s.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('s.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('s.created_at', 'DESC');

    // Antes de pintar, actualizamos las deudas vencidas a estado OVERDUE.
    // Es un solo UPDATE indexado por status — barato y deja el badge fresco.
    await this.dataSource
      .createQueryBuilder()
      .update(Debt)
      .set({ status: DebtStatus.OVERDUE })
      .where('company_id = :companyId', { companyId })
      .andWhere('due_date IS NOT NULL')
      .andWhere('due_date < :now', { now: new Date() })
      .andWhere('status IN (:...statuses)', {
        statuses: [DebtStatus.PENDING, DebtStatus.PARTIAL],
      })
      .andWhere('deleted_at IS NULL')
      .execute();

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const sale = await this.saleRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['customer', 'user', 'warehouse', 'items', 'items.product', 'debt'],
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async cancel(id: string, companyId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, {
        where: { id, company_id: companyId },
        relations: ['items', 'debt'],
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === SaleStatus.CANCELED)
        throw new BadRequestException('La venta ya está cancelada');

      sale.status = SaleStatus.CANCELED;
      await manager.save(sale);

      const stockRepo = manager.getRepository(WarehouseStock);
      const warehouseId = sale.warehouse_id;

      // Revertir stock por bodega
      for (const item of sale.items) {
        const product = await manager.findOne(Product, { where: { id: item.product_id } });
        if (!product?.track_stock || !warehouseId) continue;

        let entry = await stockRepo.findOne({
          where: { warehouse_id: warehouseId, product_id: item.product_id },
        });
        const before = entry?.stock ?? 0;
        if (entry) {
          entry.stock = before + item.quantity;
          await stockRepo.save(entry);
        } else {
          entry = stockRepo.create({
            company_id: companyId,
            warehouse_id: warehouseId,
            product_id: item.product_id,
            stock: item.quantity,
            min_stock: 0,
          });
          await stockRepo.save(entry);
        }

        await manager.save(
          manager.create(InventoryMovement, {
            company_id: companyId,
            product_id: item.product_id,
            user_id: userId,
            sale_id: sale.id,
            warehouse_id: warehouseId,
            type: MovementType.IN,
            quantity: item.quantity,
            stock_before: before,
            stock_after: before + item.quantity,
            reason: `Cancelación venta ${sale.invoice_number}`,
          }),
        );

        await this.warehousesService.recomputeProductStock(manager, item.product_id, companyId);
      }

      // Cancelar deuda asociada (también borra payments por cascade-soft N/A;
      // se conservan como histórico).
      if (sale.debt) {
        await manager.softDelete(Debt, sale.debt.id);
      }

      return { message: 'Venta cancelada y stock revertido' };
    });
  }

  /**
   * Envía la factura por correo al cliente con el PDF adjunto.
   * Usa `dto.to` si viene; si no, el email del cliente. No se permite
   * enviar facturas de ventas canceladas.
   */
  async sendByEmail(id: string, companyId: string, dto: SendSaleDto) {
    const sale = await this.findOne(id, companyId);

    if (sale.status === SaleStatus.CANCELED) {
      throw new BadRequestException('No se puede enviar una venta cancelada');
    }

    const recipient = dto.to ?? sale.customer?.email;
    if (!recipient) {
      throw new BadRequestException(
        'El cliente no tiene correo electrónico registrado. '
        + 'Indique un destinatario en el campo "to" o registre el email del cliente.',
      );
    }

    const company = await this.dataSource
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const pdfBuffer = await this.pdfService.generateInvoice(sale, company);

    await this.mailService.sendInvoice(
      recipient,
      sale.customer.name,
      company.name,
      sale.invoice_number,
      sale.type,
      Number(sale.total),
      pdfBuffer,
      dto.custom_message,
    );

    return {
      message: 'Factura enviada por correo',
      to: recipient,
      invoice_number: sale.invoice_number,
    };
  }

  async generateInvoicePdf(id: string, companyId: string): Promise<Buffer> {
    const sale = await this.findOne(id, companyId);
    const company = await this.dataSource
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return this.pdfService.generateInvoice(sale, company);
  }

  /**
   * Recupera y valida los productos rastreados (track_stock=true) en una sola
   * pasada. Devuelve la lista de {product, quantity} lista para validar
   * contra una bodega específica.
   */
  private async collectTrackedItems(
    manager: any,
    companyId: string,
    items: CreateSaleDto['items'],
  ) {
    const tracked: Array<{ product: Product; quantity: number }> = [];
    for (const itemDto of items) {
      const product = await manager.findOne(Product, {
        where: { id: itemDto.product_id, company_id: companyId },
      });
      if (!product) throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);
      if (!product.is_active) {
        throw new BadRequestException(`El producto "${product.name}" no está activo`);
      }
      if (product.track_stock) {
        tracked.push({ product, quantity: itemDto.quantity });
      }
    }
    return tracked;
  }

  /**
   * Selecciona la primera bodega activa+vendible que tiene stock suficiente
   * para todos los items rastreados. Prefiere la bodega principal si cumple;
   * si no, prueba el resto. Devuelve `null` si ninguna sirve — el caller
   * decide caer a la default y emitir un error informativo.
   */
  private async pickWarehouseWithStock(
    manager: any,
    companyId: string,
    trackedItems: Array<{ product: Product; quantity: number }>,
  ): Promise<Warehouse | null> {
    if (trackedItems.length === 0) {
      return this.warehousesService.getOrCreateDefault(companyId, manager);
    }
    const warehouses = await manager.find(Warehouse, {
      where: { company_id: companyId, is_active: true, is_sellable: true },
      order: { is_default: 'DESC', created_at: 'ASC' },
    });
    if (!warehouses.length) return null;

    const stockRepo = manager.getRepository(WarehouseStock);
    for (const wh of warehouses) {
      let ok = true;
      for (const { product, quantity } of trackedItems) {
        const entry = await stockRepo.findOne({
          where: { warehouse_id: wh.id, product_id: product.id },
        });
        if ((entry?.stock ?? 0) < quantity) {
          ok = false;
          break;
        }
      }
      if (ok) return wh;
    }
    return null;
  }

  /**
   * Generates a unique invoice number using MAX(invoice_number) for the
   * current company + year. Robust against soft-deletes and race conditions.
   * Format: INV-YYYY-XXXXXX (zero-padded to 6 digits).
   */
  private async generateInvoiceNumber(
    manager: any,
    companyId: string,
    attempt = 0,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const result = await manager
      .createQueryBuilder()
      .select('MAX(s.invoice_number)', 'max')
      .from(Sale, 's')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.invoice_number LIKE :prefix', { prefix: `${prefix}%` })
      .withDeleted()
      .getRawOne();

    const maxNumber: string | null = result?.max ?? null;
    let next = 1;
    if (maxNumber) {
      const numericPart = maxNumber.replace(prefix, '');
      const parsed = parseInt(numericPart, 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }
    next += attempt;

    return `${prefix}${String(next).padStart(6, '0')}`;
  }
}
