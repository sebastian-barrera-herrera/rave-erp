import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany, Unique,
} from 'typeorm';
import { QuotationStatus } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { QuotationItem } from './quotation-item.entity';

@Entity('quotations')
@Unique('UQ_quotations_company_number', ['company_id', 'quotation_number'])
export class Quotation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  customer_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  quotation_number: string;

  @Column({ type: 'enum', enum: QuotationStatus, default: QuotationStatus.DRAFT })
  status: QuotationStatus;

  @Column('decimal', { precision: 14, scale: 2 })
  subtotal: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  tax_amount: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column('decimal', { precision: 14, scale: 2 })
  total: number;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true })
  terms: string;

  @Column({ nullable: true })
  valid_until: Date;

  @Column({ nullable: true })
  sent_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => QuotationItem, (i) => i.quotation, { cascade: true, eager: true })
  items: QuotationItem[];
}
