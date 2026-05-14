import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany, Unique,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { WarehouseStock } from './warehouse-stock.entity';

/**
 * Bodega / almacén físico de la empresa.
 *
 * Reglas:
 *   - Cada empresa tiene al menos una bodega marcada `is_default=true`,
 *     creada automáticamente al activar el módulo.
 *   - `is_sellable=false` → los productos cuyo único stock está en esta
 *     bodega NO se ofrecen en endpoints de venta (útil para bodegas de
 *     reserva, devoluciones, dañados, etc.).
 */
@Entity('warehouses')
@Unique('UQ_warehouses_company_code', ['company_id', 'code'])
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 100 })
  name: string;

  /** Código corto único por empresa, ej: 'PRINCIPAL', 'BOG-01'. */
  @Column({ length: 30 })
  code: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: true })
  is_active: boolean;

  /** Si es false, los productos de esta bodega no se ofrecen para venta. */
  @Column({ default: true })
  is_sellable: boolean;

  /** La bodega por defecto se usa cuando una venta no especifica bodega. */
  @Column({ default: false })
  is_default: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => WarehouseStock, (s) => s.warehouse)
  stocks: WarehouseStock[];
}
