import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Debt } from '../modules/debts/entities/debt.entity';
import { Company } from '../modules/companies/entities/company.entity';
import { DebtStatus, SubscriptionStatus } from '../common/types/enums';
import { MailService } from './services/mail.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Debt)
    private readonly debtRepo: Repository<Debt>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly mailService: MailService,
  ) {}

  // Run every day at midnight
  async markOverdueDebts() {
    this.logger.log('Running: markOverdueDebts');
    const result = await this.debtRepo
      .createQueryBuilder()
      .update(Debt)
      .set({ status: DebtStatus.OVERDUE })
      .where('due_date < :now', { now: new Date() })
      .andWhere('status IN (:...statuses)', {
        statuses: [DebtStatus.PENDING, DebtStatus.PARTIAL],
      })
      .andWhere('deleted_at IS NULL')
      .execute();

    this.logger.log(`Marked ${result.affected} debts as OVERDUE`);
  }

  // Run every hour — expire trials
  async expireTrials() {
    this.logger.log('Running: expireTrials');
    const expired = await this.companyRepo.find({
      where: {
        subscription_status: SubscriptionStatus.TRIAL,
        trial_ends_at: LessThan(new Date()),
      },
    });

    for (const company of expired) {
      company.subscription_status = SubscriptionStatus.CANCELED;
      await this.companyRepo.save(company);
      this.logger.warn(`Trial expired for company: ${company.name}`);

      this.mailService
        .sendTrialExpired(company.email, company.name)
        .catch((e) => this.logger.warn(`Trial expired email failed: ${e.message}`));
    }
  }

  // Run every day at 8am — alert low stock
  async alertLowStock() {
    this.logger.log('Running: alertLowStock');
    const companies = await this.companyRepo.find({
      where: { subscription_status: SubscriptionStatus.ACTIVE },
    });

    for (const company of companies) {
      const lowStockProducts = await this.debtRepo.manager.query(
        `SELECT p.name, p.stock, p.min_stock, u.email as admin_email
         FROM products p
         JOIN users u ON u.company_id = p.company_id AND u.role = 'ADMIN' AND u.deleted_at IS NULL
         WHERE p.company_id = $1
           AND p.stock <= p.min_stock
           AND p.track_stock = true
           AND p.is_active = true
           AND p.deleted_at IS NULL
         LIMIT 20`,
        [company.id],
      );

      if (lowStockProducts.length > 0) {
        const adminEmail = lowStockProducts[0].admin_email;
        if (adminEmail) {
          this.mailService
            .sendLowStockAlert(adminEmail, lowStockProducts)
            .catch((e) => this.logger.warn(`Low stock email failed: ${e.message}`));
        }
      }
    }
  }
}
