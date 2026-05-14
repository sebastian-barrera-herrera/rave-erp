import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { PlanTaskPriority } from '../../../common/types/enums';
import { DailyPlan } from './daily-plan.entity';

@Entity('plan_tasks')
export class PlanTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plan_id: string;

  @ManyToOne(() => DailyPlan, (p) => p.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: DailyPlan;

  @Column({ length: 200 })
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: PlanTaskPriority, default: PlanTaskPriority.MEDIUM })
  priority: PlanTaskPriority;

  @Column({ default: false })
  is_done: boolean;

  @Column({ type: 'timestamp', nullable: true })
  done_at: Date | null;

  /** Orden manual para drag-and-drop en el frontend. */
  @Column('int', { default: 0 })
  order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
