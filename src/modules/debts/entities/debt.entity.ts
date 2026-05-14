import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
  OneToMany, OneToOne,
} from 'typeorm';
import { DebtStatus } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Payment } from '../../payments/entities/payment.entity';

@Entity('debts')
export class Debt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, (c) => c.debts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  sale_id: string;

  @OneToOne(() => Sale, (s) => s.debt)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column()
  customer_id: string;

  @ManyToOne(() => Customer, (c) => c.debts)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column('decimal', { precision: 14, scale: 2 })
  total_amount: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  paid_amount: number;

  @Column('decimal', { precision: 14, scale: 2 })
  remaining_amount: number;

  @Column({ type: 'enum', enum: DebtStatus, default: DebtStatus.PENDING })
  status: DebtStatus;

  @Column({ nullable: true })
  due_date: Date;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => Payment, (p) => p.debt)
  payments: Payment[];
}
