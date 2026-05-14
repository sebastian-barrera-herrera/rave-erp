import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
  OneToMany, OneToOne, Unique,
} from 'typeorm';
import { SaleType, SaleStatus } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { SaleItem } from './sale-item.entity';
import { Debt } from '../../debts/entities/debt.entity';

@Entity('sales')
@Unique('UQ_sales_company_invoice', ['company_id', 'invoice_number'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, (c) => c.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  customer_id: string;

  @ManyToOne(() => Customer, (c) => c.sales)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  warehouse_id: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  /**
   * Anticipo registrado al momento de crear la venta a crédito.
   * Se conserva como referencia auditable; los movimientos de saldo viven
   * en la `Debt` asociada (paid_amount/remaining_amount) y se mantienen
   * vía `Payment`s.
   */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  down_payment: number;

  @Column({ length: 50 })
  invoice_number: string;

  @Column({ type: 'enum', enum: SaleType })
  type: SaleType;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  status: SaleStatus;

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

  /** For credit sales — when payment is due */
  @Column({ nullable: true })
  due_date: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => SaleItem, (i) => i.sale, { cascade: true, eager: true })
  items: SaleItem[];

  @OneToOne(() => Debt, (d) => d.sale)
  debt: Debt;
}
