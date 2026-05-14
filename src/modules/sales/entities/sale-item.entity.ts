import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sale_id: string;

  @ManyToOne(() => Sale, (s) => s.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column()
  product_id: string;

  @ManyToOne(() => Product, (p) => p.sale_items)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ length: 200 })
  product_name: string; // Snapshot at time of sale

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 14, scale: 2 })
  unit_price: number; // Snapshot at time of sale

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  discount: number;

  @Column('decimal', { precision: 14, scale: 2 })
  subtotal: number;

  @CreateDateColumn()
  created_at: Date;
}
