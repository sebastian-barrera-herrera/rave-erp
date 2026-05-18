import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Return } from './return.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('return_items')
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  return_id: string;

  @ManyToOne(() => Return, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_id' })
  return_record: Return;

  @Column({ type: 'uuid', nullable: true })
  product_id: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  /** Snapshot del nombre — sobrevive a borrados de producto. */
  @Column({ length: 200 })
  product_name: string;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  unit_price: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({ length: 200, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  created_at: Date;
}
