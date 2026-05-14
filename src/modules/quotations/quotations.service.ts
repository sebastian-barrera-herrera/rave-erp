import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Quotation } from './entities/quotation.entity';
import { QuotationItem } from './entities/quotation-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Company } from '../companies/entities/company.entity';
import {
  CreateQuotationDto, UpdateQuotationDto, FilterQuotationsDto, SendQuotationDto,
} from './dto/quotation.dto';
import { QuotationStatus } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { PdfService } from '../pdf/pdf.service';
import { MailService } from '../../shared/services/mail.service';

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    @InjectRepository(Quotation)
    private readonly quotationRepo: Repository<Quotation>,
    private readonly dataSource: DataSource,
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateQuotationDto, companyId: string, userId: string) {
    const MAX_RETRIES = 5;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.createOnce(dto, companyId, userId, attempt);
      } catch (err: any) {
        const isDuplicate =
          err?.code === '23505' || // PostgreSQL unique violation
          /duplicate key value/i.test(err?.message ?? '') ||
          /quotation_number/i.test(err?.message ?? '');
        if (isDuplicate && attempt < MAX_RETRIES - 1) {
          // Wait briefly to let the other transaction commit, then retry.
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
    dto: CreateQuotationDto,
    companyId: string,
    userId: string,
    attempt: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, {
        where: { id: dto.customer_id, company_id: companyId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');

      const company = await manager.findOne(Company, { where: { id: companyId } });
      if (!company) throw new NotFoundException('Empresa no encontrada');

      const items: QuotationItem[] = [];
      let subtotal = 0;

      for (const itemDto of dto.items) {
        let description = itemDto.description;
        let unitPrice = itemDto.unit_price;

        if (itemDto.product_id) {
          const product = await manager.findOne(Product, {
            where: { id: itemDto.product_id, company_id: companyId },
          });
          if (!product) throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);
          if (!product.is_active) throw new BadRequestException(`El producto "${product.name}" no está activo`);
          description = itemDto.description || product.name;
          unitPrice = itemDto.unit_price ?? Number(product.price);
        }

        const itemDiscount = itemDto.discount ?? 0;
        const itemSubtotal = (unitPrice * itemDto.quantity) - itemDiscount;

        const itemEntity = manager.create(QuotationItem, {
          description,
          quantity: itemDto.quantity,
          unit_price: unitPrice,
          discount: itemDiscount,
          subtotal: itemSubtotal,
        });
        if (itemDto.product_id) itemEntity.product_id = itemDto.product_id;
        if (itemDto.unit) itemEntity.unit = itemDto.unit;
        items.push(itemEntity);

        subtotal += itemSubtotal;
      }

      const globalDiscount = dto.discount ?? 0;
      const taxableAmount = subtotal - globalDiscount;
      // `apply_tax` por defecto se interpreta como `true` para mantener
      // compat con clientes antiguos que no envían el campo. El frontend
      // siempre envía un valor explícito (checkbox marcado/desmarcado).
      const applyTax = dto.apply_tax !== false;
      const taxAmount = applyTax ? taxableAmount * Number(company.tax_rate) : 0;
      const total = taxableAmount + taxAmount;

      const quotationNumber = await this.generateQuotationNumber(manager, companyId, attempt);

      const quotation = manager.create(Quotation, {
        customer_id: dto.customer_id,
        user_id: userId,
        quotation_number: quotationNumber,
        status: QuotationStatus.DRAFT,
        subtotal,
        tax_amount: taxAmount,
        discount: globalDiscount,
        total,
        items,
      });
      quotation.company_id = companyId;
      if (dto.notes) quotation.notes = dto.notes;
      if (dto.terms) quotation.terms = dto.terms;
      if (dto.valid_until) quotation.valid_until = new Date(dto.valid_until);

      await manager.save(quotation);

      return manager.findOne(Quotation, {
        where: { id: quotation.id },
        relations: ['customer', 'user', 'items'],
      });
    });
  }

  async findAll(companyId: string, filters: FilterQuotationsDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.quotationRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.customer', 'c')
      .leftJoinAndSelect('q.user', 'u')
      .where('q.company_id = :companyId', { companyId })
      .andWhere('q.deleted_at IS NULL');

    if (filters.status) qb.andWhere('q.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('q.customer_id = :cid', { cid: filters.customer_id });
    if (filters.search) qb.andWhere('q.quotation_number ILIKE :s', { s: `%${filters.search}%` });
    if (filters.date_from) qb.andWhere('q.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('q.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('q.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const quotation = await this.quotationRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['customer', 'user', 'items'],
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    return quotation;
  }

  async update(id: string, dto: UpdateQuotationDto, companyId: string) {
    return this.dataSource.transaction(async (manager) => {
      const quotation = await manager.findOne(Quotation, {
        where: { id, company_id: companyId },
        relations: ['items'],
      });
      if (!quotation) throw new NotFoundException('Cotización no encontrada');

      if (
        quotation.status === QuotationStatus.ACCEPTED ||
        quotation.status === QuotationStatus.REJECTED
      ) {
        throw new BadRequestException('No se puede editar una cotización aceptada o rechazada');
      }

      if (dto.customer_id && dto.customer_id !== quotation.customer_id) {
        const customer = await manager.findOne(Customer, {
          where: { id: dto.customer_id, company_id: companyId },
        });
        if (!customer) throw new NotFoundException('Cliente no encontrado');
        quotation.customer_id = dto.customer_id;
      }

      if (dto.items && dto.items.length > 0) {
        await manager.delete(QuotationItem, { quotation_id: id });

        const company = await manager.findOne(Company, { where: { id: companyId } });
        if (!company) throw new NotFoundException('Empresa no encontrada');
        const newItems: QuotationItem[] = [];
        let subtotal = 0;

        for (const itemDto of dto.items) {
          let description = itemDto.description;
          let unitPrice = itemDto.unit_price;

          if (itemDto.product_id) {
            const product = await manager.findOne(Product, {
              where: { id: itemDto.product_id, company_id: companyId },
            });
            if (!product) throw new NotFoundException(`Producto ${itemDto.product_id} no encontrado`);
            description = itemDto.description || product.name;
            unitPrice = itemDto.unit_price ?? Number(product.price);
          }

          const itemDiscount = itemDto.discount ?? 0;
          const itemSubtotal = (unitPrice * itemDto.quantity) - itemDiscount;

          const newItem = manager.create(QuotationItem, {
            description,
            quantity: itemDto.quantity,
            unit_price: unitPrice,
            discount: itemDiscount,
            subtotal: itemSubtotal,
          });
          newItem.quotation_id = id;
          if (itemDto.product_id) newItem.product_id = itemDto.product_id;
          if (itemDto.unit) newItem.unit = itemDto.unit;
          newItems.push(newItem);

          subtotal += itemSubtotal;
        }

        await manager.save(QuotationItem, newItems);

        const globalDiscount = dto.discount ?? quotation.discount ?? 0;
        const taxableAmount = subtotal - Number(globalDiscount);
        // En update preferimos lo que mande el DTO; si no viene, deducimos
        // del tax_amount previo si era 0 → no aplicaba, si era >0 → sí aplicaba.
        const applyTax =
          dto.apply_tax !== undefined
            ? dto.apply_tax !== false
            : Number(quotation.tax_amount) > 0;
        const taxAmount = applyTax ? taxableAmount * Number(company.tax_rate) : 0;

        quotation.items = newItems;
        quotation.subtotal = subtotal;
        quotation.discount = Number(globalDiscount);
        quotation.tax_amount = taxAmount;
        quotation.total = taxableAmount + taxAmount;
      } else if (dto.discount !== undefined || dto.apply_tax !== undefined) {
        const globalDiscount = dto.discount ?? Number(quotation.discount ?? 0);
        const company = await manager.findOne(Company, { where: { id: companyId } });
        if (!company) throw new NotFoundException('Empresa no encontrada');
        const taxableAmount = Number(quotation.subtotal) - globalDiscount;
        const applyTax =
          dto.apply_tax !== undefined
            ? dto.apply_tax !== false
            : Number(quotation.tax_amount) > 0;
        const taxAmount = applyTax ? taxableAmount * Number(company.tax_rate) : 0;
        quotation.discount = globalDiscount;
        quotation.tax_amount = taxAmount;
        quotation.total = taxableAmount + taxAmount;
      }

      if (dto.notes !== undefined) quotation.notes = dto.notes as string;
      if (dto.terms !== undefined) quotation.terms = dto.terms as string;
      if (dto.valid_until !== undefined) {
        quotation.valid_until = dto.valid_until ? new Date(dto.valid_until) : (null as unknown as Date);
      }
      if (dto.status !== undefined) quotation.status = dto.status;

      await manager.save(quotation);

      return manager.findOne(Quotation, {
        where: { id },
        relations: ['customer', 'user', 'items'],
      });
    });
  }

  async remove(id: string, companyId: string) {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status === QuotationStatus.ACCEPTED) {
      throw new BadRequestException('No se puede eliminar una cotización aceptada');
    }
    await this.quotationRepo.softDelete(id);
    return { message: 'Cotización eliminada correctamente' };
  }

  async generatePdf(id: string, companyId: string): Promise<Buffer> {
    const quotation = await this.findOne(id, companyId);
    const company = await this.dataSource
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return this.pdfService.generateQuotation(quotation, company);
  }

  async sendByEmail(id: string, companyId: string, dto: SendQuotationDto) {
    const quotation = await this.findOne(id, companyId);

    if (!quotation.customer?.email) {
      throw new BadRequestException('El cliente no tiene correo electrónico registrado');
    }

    const company = await this.dataSource
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const pdfBuffer = await this.pdfService.generateQuotation(quotation, company);

    await this.mailService.sendQuotation(
      quotation.customer.email,
      quotation.customer.name,
      company.name,
      quotation.quotation_number,
      quotation.valid_until,
      quotation.total,
      pdfBuffer,
      dto.custom_message,
    );

    // Mark as SENT if it was DRAFT
    if (quotation.status === QuotationStatus.DRAFT) {
      await this.quotationRepo.update(id, {
        status: QuotationStatus.SENT,
        sent_at: new Date(),
      });
    }

    return { message: `Cotización enviada a ${quotation.customer.email}` };
  }

  /**
   * Generates a unique quotation number using MAX(quotation_number) for the
   * current company + year.
   *
   * Robust against:
   *  - soft-deleted quotations (uses .withDeleted() — they still hold the unique slot)
   *  - the global UNIQUE constraint (we always look at the highest existing)
   *  - concurrent inserts (caller wraps in retry loop; `attempt` bumps the offset)
   *
   * Format: COT-YYYY-XXXXXX (zero-padded to 6 digits).
   */
  private async generateQuotationNumber(
    manager: any,
    companyId: string,
    attempt = 0,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `COT-${year}-`;

    const result = await manager
      .createQueryBuilder()
      .select('MAX(q.quotation_number)', 'max')
      .from(Quotation, 'q')
      .where('q.company_id = :companyId', { companyId })
      .andWhere('q.quotation_number LIKE :prefix', { prefix: `${prefix}%` })
      .withDeleted()
      .getRawOne();

    const maxNumber: string | null = result?.max ?? null;
    let next = 1;
    if (maxNumber) {
      const numericPart = maxNumber.replace(prefix, '');
      const parsed = parseInt(numericPart, 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }
    // Bump the candidate if we're retrying after a duplicate-key collision.
    next += attempt;

    return `${prefix}${String(next).padStart(6, '0')}`;
  }
}
