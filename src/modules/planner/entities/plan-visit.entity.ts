import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { PlanVisitStatus } from '../../../common/types/enums';
import { DailyPlan } from './daily-plan.entity';
import { Customer } from '../../customers/entities/customer.entity';

@Entity('plan_visits')
export class PlanVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plan_id: string;

  @ManyToOne(() => DailyPlan, (p) => p.visits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: DailyPlan;

  /**
   * Cliente al que visitar. Opcional: una visita puede ser libre
   * (prospecto sin registrar todavía) — en ese caso se llena `customer_name`
   * y `address` manualmente.
   */
  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ length: 200 })
  customer_name: string;

  @Column({ nullable: true })
  address: string;

  /** Hora estimada (TIME sin fecha — la fecha viene del DailyPlan). */
  @Column({ type: 'time', nullable: true })
  scheduled_time: string | null;

  @Column({ type: 'enum', enum: PlanVisitStatus, default: PlanVisitStatus.PENDING })
  status: PlanVisitStatus;

  @Column({ nullable: true })
  notes: string;

  /** Orden manual para definir la ruta del día. */
  @Column('int', { default: 0 })
  order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
