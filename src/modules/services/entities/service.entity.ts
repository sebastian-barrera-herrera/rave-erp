import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { ServiceStatus } from '../../../common/types/enums';

/**
 * Servicio técnico ejecutado por un trabajador para un cliente. Modelo
 * pedido por talleres / empresas de reparación que necesitan rastrear:
 *   - quién hizo el servicio
 *   - cuánto se cobró
 *   - cuánto tiempo tomó
 *   - tipo y categoría para análisis
 */
@Entity('services')
@Unique('UQ_services_company_number', ['company_id', 'service_number'])
export class ServiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /** Numerado por empresa: SVC-YYYY-XXXXXX. */
  @Column({ length: 50 })
  service_number: string;

  @Column({ length: 120 })
  service_type: string;

  @Column({ length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 20, default: ServiceStatus.COMPLETED })
  status: ServiceStatus;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  /** User del equipo que ejecutó el servicio. Opcional para servicios
   *  realizados por contratistas externos no registrados. */
  @Column({ type: 'uuid', nullable: true })
  worker_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'worker_id' })
  worker: User | null;

  /** Texto libre cuando worker_id es null (ej. "Pedro Gómez - contratista"). */
  @Column({ length: 150, nullable: true })
  worker_name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  cost: number;

  @Column('int', { default: 0 })
  duration_minutes: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
