import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import {
  CreateCustomerDto, UpdateCustomerDto, FilterCustomersDto,
} from './dto/customer.dto';
import { paginate } from '../../common/types/pagination.type';
import { CustomerKind } from '../../common/types/enums';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async create(dto: CreateCustomerDto, companyId: string) {
    const customer = this.customerRepo.create({ ...dto, company_id: companyId });
    return this.customerRepo.save(customer);
  }

  async findAll(companyId: string, filters: FilterCustomersDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .andWhere('c.deleted_at IS NULL');

    if (filters.search)
      qb.andWhere('(c.name ILIKE :s OR c.email ILIKE :s OR c.document_number ILIKE :s)', {
        s: `%${filters.search}%`,
      });
    if (typeof filters.is_active === 'boolean')
      qb.andWhere('c.is_active = :active', { active: filters.is_active });
    // Filtro por tipo. SUPPLIER/CUSTOMER incluyen también BOTH para que
    // un contacto "ambos" aparezca en ambas vistas del frontend.
    if (filters.kind) {
      if (filters.kind === CustomerKind.BOTH) {
        qb.andWhere('c.kind = :kind', { kind: CustomerKind.BOTH });
      } else {
        qb.andWhere('c.kind IN (:...kinds)', {
          kinds: [filters.kind, CustomerKind.BOTH],
        });
      }
    }

    qb.skip(skip).take(limit).orderBy('c.name', 'ASC');
    const [data, total] = await qb.getManyAndCount();

    // El listado muestra una columna "Deuda" que antes salía vacía porque
    // findAll no devolvía total_debt. Lo calculamos con UN solo query
    // agrupado en vez de N+1.
    if (data.length) {
      const ids = data.map((c) => c.id);
      const debtRows: Array<{ customer_id: string; total: string }> = await this.customerRepo
        .manager
        .createQueryBuilder()
        .select('d.customer_id', 'customer_id')
        .addSelect('SUM(d.remaining_amount)', 'total')
        .from('debts', 'd')
        .where('d.customer_id IN (:...ids)', { ids })
        .andWhere('d.company_id = :companyId', { companyId })
        .andWhere("d.status != 'PAID'")
        .andWhere('d.deleted_at IS NULL')
        .groupBy('d.customer_id')
        .getRawMany();

      const byId = new Map(debtRows.map((r) => [r.customer_id, Number(r.total) || 0]));
      for (const c of data) {
        const td = byId.get(c.id) ?? 0;
        (c as any).total_debt = td;
        (c as any).has_debt = td > 0;
      }
    }

    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const customer = await this.customerRepo.findOne({ where: { id, company_id: companyId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async findOneWithHistory(id: string, companyId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['sales', 'debts', 'debts.payments'],
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const sales = (customer.sales || [])
      .filter((s: any) => !s.deleted_at)
      .sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((s: any) => ({
        id: s.id,
        invoice_number: s.invoice_number,
        type: s.type,
        status: s.status,
        total: s.total,
        created_at: s.created_at,
      }));

    const debts = (customer.debts || [])
      .filter((d: any) => !d.deleted_at)
      .sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((d: any) => ({
        id: d.id,
        sale_id: d.sale_id,
        total_amount: d.total_amount,
        paid_amount: d.paid_amount,
        remaining_amount: d.remaining_amount,
        status: d.status,
        due_date: d.due_date,
        notes: d.notes,
        created_at: d.created_at,
      }));

    const payments = (customer.debts || [])
      .flatMap((d: any) => (d.payments || []).map((p: any) => ({
        id: p.id,
        debt_id: p.debt_id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        created_at: p.created_at,
      })))
      .sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    const customerSummary = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      document_type: customer.document_type,
      document_number: customer.document_number,
      is_active: customer.is_active,
      kind: customer.kind,
    };

    return {
      customer: customerSummary,
      sales,
      debts,
      payments,
    };
  }

  async update(id: string, dto: UpdateCustomerDto, companyId: string) {
    const customer = await this.findOne(id, companyId);
    Object.assign(customer, dto);
    return this.customerRepo.save(customer);
  }

  async remove(id: string, companyId: string) {
    const customer = await this.findOne(id, companyId);
    await this.customerRepo.softDelete(id);
    return { message: 'Cliente eliminado correctamente' };
  }
}
