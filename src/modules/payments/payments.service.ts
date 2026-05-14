import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Debt } from '../debts/entities/debt.entity';
import { CreatePaymentDto, FilterPaymentsDto } from './dto/payment.dto';
import { DebtStatus } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Debt)
    private readonly debtRepo: Repository<Debt>,
    private readonly dataSource: DataSource,
  ) {}

  async create(debtId: string, dto: CreatePaymentDto, companyId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(Debt, {
        where: { id: debtId, company_id: companyId },
      });
      if (!debt) throw new NotFoundException('Deuda no encontrada');
      if (debt.status === DebtStatus.PAID)
        throw new BadRequestException('Esta deuda ya está pagada completamente');

      const remaining = Number(debt.remaining_amount);
      if (dto.amount > remaining) {
        throw new BadRequestException(
          `El abono (${dto.amount}) supera el saldo pendiente (${remaining.toFixed(2)})`,
        );
      }

      const payment = manager.create(Payment, {
        ...dto,
        debt_id: debtId,
        company_id: companyId,
        user_id: userId,
      });
      await manager.save(payment);

      debt.paid_amount = Number(debt.paid_amount) + dto.amount;
      debt.remaining_amount = Number(debt.remaining_amount) - dto.amount;

      if (debt.remaining_amount <= 0) {
        debt.remaining_amount = 0;
        debt.status = DebtStatus.PAID;
      } else {
        debt.status = DebtStatus.PARTIAL;
      }

      await manager.save(debt);
      return payment;
    });
  }

  async findAll(companyId: string, filters: FilterPaymentsDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    // Incluimos la venta asociada para mostrar el número de factura en la
    // pestaña "Pagos recibidos" del frontend.
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.debt', 'd')
      .leftJoinAndSelect('d.customer', 'c')
      .leftJoinAndSelect('d.sale', 's')
      .leftJoinAndSelect('p.user', 'u')
      .where('p.company_id = :companyId', { companyId });

    if (filters.debt_id) qb.andWhere('p.debt_id = :did', { did: filters.debt_id });
    if (filters.method) qb.andWhere('p.method = :m', { m: filters.method });
    if (filters.date_from) qb.andWhere('p.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('p.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('p.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }
}
