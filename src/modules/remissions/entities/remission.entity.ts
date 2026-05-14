import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
  OneToMany, Unique,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { RemissionStatus } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';
import { RemissionItem } from './remission-item.entity';

/**
 * Orden de salida (remisión).
 *
 * Numeración: `REM-{año}-{6 dígitos secuenciales por empresa}`. Cada empresa
 * lleva su propio contador.
 */
@Entity('remissions')
@Unique('UQ_remissions_company_number', ['company_id', 'remission_number'])
export class Remission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 50 })
  remission_number: string;

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

  @Column({ type: 'uuid', nullable: true })
  warehouse_id: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ type: 'enum', enum: RemissionStatus, default: RemissionStatus.ISSUED })
  status: RemissionStatus;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  @Exclude()
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => RemissionItem, (i) => i.remission, { cascade: true, eager: true })
  items: RemissionItem[];
}
