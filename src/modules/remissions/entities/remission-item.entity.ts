import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Remission } from './remission.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('remission_items')
export class RemissionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  remission_id: string;

  @ManyToOne(() => Remission, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'remission_id' })
  remission: Remission;

  /** Producto puede ser opcional (descripción libre permitida). */
  @Column({ type: 'uuid', nullable: true })
  product_id: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  /** Snapshot del nombre/descripción del producto al momento de la remisión. */
  @Column({ length: 200 })
  product_name: string;

  @Column({ nullable: true })
  description: string;

  @Column('int')
  quantity: number;

  @Column({ default: 'unidad', length: 50 })
  unit: string;

  /** Opcional — algunas remisiones llevan precios de referencia. */
  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  unit_price: number;

  @CreateDateColumn()
  created_at: Date;
}
