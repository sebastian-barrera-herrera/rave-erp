import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Debt } from './entities/debt.entity';
import { FilterDebtsDto, UpdateDebtDto } from './dto/debt.dto';
import { DebtStatus } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt)
    private readonly debtRepo: Repository<Debt>,
  ) {}

  async findAll(companyId: string, filters: FilterDebtsDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Listado: solo id+nombre del cliente y datos mínimos de la venta.
    // Los datos sensibles del cliente (documento, dirección) solo aparecen
    // en findOne (vista de detalle).
    const qb = this.debtRepo
      .createQueryBuilder('d')
      .leftJoin('d.customer', 'c')
      .leftJoin('d.sale', 's')
      .select([
        'd.id', 'd.total_amount', 'd.paid_amount', 'd.remaining_amount',
        'd.status', 'd.due_date', 'd.created_at',
        'c.id', 'c.name',
        's.id', 's.invoice_number',
      ])
      .where('d.company_id = :companyId', { companyId })
      .andWhere('d.deleted_at IS NULL');

    if (filters.status) qb.andWhere('d.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('d.customer_id = :cid', { cid: filters.customer_id });
    if (filters.date_from) qb.andWhere('d.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('d.created_at <= :to', { to: new Date(filters.date_to) });
    if (filters.overdue_only) {
      qb.andWhere('d.due_date < :now', { now: new Date() })
        .andWhere('d.status != :paid', { paid: DebtStatus.PAID });
    }

    qb.skip(skip).take(limit).orderBy('d.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const debt = await this.debtRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['customer', 'sale', 'sale.items', 'payments', 'payments.user'],
    });
    if (!debt) throw new NotFoundException('Deuda no encontrada');
    return debt;
  }

  async update(id: string, dto: UpdateDebtDto, companyId: string) {
    const debt = await this.debtRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!debt) throw new NotFoundException('Deuda no encontrada');
    if (dto.due_date !== undefined) debt.due_date = new Date(dto.due_date);
    if (dto.notes !== undefined) debt.notes = dto.notes;
    await this.debtRepo.save(debt);
    return this.findOne(id, companyId);
  }

  async getSummary(companyId: string) {
    // `overdue_count` se calcula dinámicamente con `due_date < NOW()` en lugar
    // de leer `status = 'OVERDUE'`. La columna `status` solo se actualiza
    // cuando alguien corre `markOverdue()` manualmente, así que basarse en
    // ella dejaba el indicador en cero hasta que se ejecutara ese job.
    // Calcular en vivo es consistente con cómo el listado filtra por
    // `overdue_only` (también compara `due_date < NOW()`).
    const result = await this.debtRepo
      .createQueryBuilder('d')
      .select([
        'SUM(d.total_amount) AS total_amount',
        'SUM(d.paid_amount) AS paid_amount',
        'SUM(d.remaining_amount) AS remaining_amount',
        'COUNT(*) AS total_debts',
        `SUM(CASE WHEN d.status = 'PAID' THEN 1 ELSE 0 END) AS paid_count`,
        `SUM(CASE
            WHEN d.status != 'PAID'
             AND (d.due_date IS NULL OR d.due_date >= NOW())
            THEN 1 ELSE 0 END) AS pending_count`,
        `SUM(CASE
            WHEN d.status != 'PAID'
             AND d.due_date IS NOT NULL
             AND d.due_date < NOW()
            THEN 1 ELSE 0 END) AS overdue_count`,
        `COALESCE(SUM(CASE
            WHEN d.status != 'PAID'
             AND d.due_date IS NOT NULL
             AND d.due_date < NOW()
            THEN d.remaining_amount ELSE 0 END), 0) AS overdue_amount`,
      ])
      .where('d.company_id = :companyId', { companyId })
      .andWhere('d.deleted_at IS NULL')
      .getRawOne();
    return result;
  }

  // Mark overdue debts — can be called manually or via cron
  async markOverdue(companyId?: string) {
    const qb = this.debtRepo
      .createQueryBuilder()
      .update(Debt)
      .set({ status: DebtStatus.OVERDUE })
      .where('due_date < :now', { now: new Date() })
      .andWhere('status IN (:...statuses)', { statuses: [DebtStatus.PENDING, DebtStatus.PARTIAL] })
      .andWhere('deleted_at IS NULL');

    if (companyId) qb.andWhere('company_id = :companyId', { companyId });

    return qb.execute();
  }
}
