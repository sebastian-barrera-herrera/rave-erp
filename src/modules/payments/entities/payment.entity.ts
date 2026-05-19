import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { PaymentMethod } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Debt } from '../../debts/entities/debt.entity';
import { User } from '../../users/entities/user.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, (c) => c.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  debt_id: string;

  @ManyToOne(() => Debt, (d) => d.payments)
  @JoinColumn({ name: 'debt_id' })
  debt: Debt;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('decimal', { precision: 14, scale: 2 })
  amount: number;

  // Varchar en lugar de enum nativo PG: agregar valores nuevos al enum
  // requiere ALTER TYPE en cada despliegue. Con varchar + validación en
  // class-validator basta con extender el enum TS y subir el código.
  @Column({ type: 'varchar', length: 20, default: 'CASH' })
  method: PaymentMethod;

  @Column({ nullable: true, length: 100 })
  reference: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
