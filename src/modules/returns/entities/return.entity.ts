import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { ReturnItem } from './return-item.entity';
import { ReturnType, ReturnStatus } from '../../../common/types/enums';

@Entity('returns')
export class Return {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /**
   * SALE_RETURN: devolución vinculada a una venta. Repone stock y reduce
   * deuda si la venta fue a crédito.
   * DAMAGE: avería / merma. Solo descuenta stock.
   */
  @Column({ type: 'varchar', length: 20 })
  type: ReturnType;

  @Column({ type: 'varchar', length: 20, default: ReturnStatus.COMPLETED })
  status: ReturnStatus;

  @Column({ type: 'uuid', nullable: true })
  sale_id: string | null;

  @ManyToOne(() => Sale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale | null;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ type: 'uuid', nullable: true })
  warehouse_id: string | null;

  @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Monto reembolsado (solo aplica a SALE_RETURN). */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  total_amount: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;

  @OneToMany(() => ReturnItem, (i) => i.return_record, { cascade: true, eager: true })
  items: ReturnItem[];
}
