import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Unique,
} from 'typeorm';
import { TicketType, TicketStatus, TicketPriority } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { TicketMessage } from './ticket-message.entity';

@Entity('support_tickets')
@Unique('UQ_support_tickets_company_number', ['company_id', 'ticket_number'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 50 })
  ticket_number: string;

  @Column({ type: 'enum', enum: TicketType })
  type: TicketType;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ length: 300 })
  subject: string;

  @Column({ nullable: true })
  resolved_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => TicketMessage, (m) => m.ticket, { cascade: true })
  messages: TicketMessage[];
}
