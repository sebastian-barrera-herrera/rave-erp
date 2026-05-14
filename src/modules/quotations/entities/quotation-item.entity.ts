import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Quotation } from './quotation.entity';

@Entity('quotation_items')
export class QuotationItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  quotation_id: string;

  @ManyToOne(() => Quotation, (q) => q.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ nullable: true })
  product_id: string;

  @Column({ length: 300 })
  description: string;

  @Column({ nullable: true })
  unit: string;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2 })
  unit_price: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column('decimal', { precision: 14, scale: 2 })
  subtotal: number;

  @CreateDateColumn()
  created_at: Date;
}
