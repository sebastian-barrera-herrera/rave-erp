import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
  OneToMany, Unique,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { PlanTask } from './plan-task.entity';
import { PlanVisit } from './plan-visit.entity';

/**
 * Plan diario de un usuario.
 *
 * Reglas:
 *   - Hay máximo UN plan por (user_id, plan_date) — UNIQUE.
 *   - El plan se crea "lazy" la primera vez que el usuario añade una task
 *     o una visita. POST /planner es idempotente (upsert por fecha).
 *   - `plan_date` es DATE puro (sin hora) para que los planes sean por jornada,
 *     no por momento.
 */
@Entity('daily_plans')
@Unique('UQ_daily_plans_user_date', ['user_id', 'plan_date'])
export class DailyPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date' })
  plan_date: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => PlanTask, (t) => t.plan, { cascade: true, eager: true })
  tasks: PlanTask[];

  @OneToMany(() => PlanVisit, (v) => v.plan, { cascade: true, eager: true })
  visits: PlanVisit[];
}
