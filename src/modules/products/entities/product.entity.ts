import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, (c) => c.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 100 })
  sku: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true, length: 100 })
  category: string;

  @Column({ nullable: true, length: 100 })
  brand: string;

  @Column('decimal', { precision: 14, scale: 2 })
  price: number; // Selling price

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  cost: number; // Purchase cost

  @Column('int', { default: 0 })
  stock: number;

  @Column('int', { default: 5 })
  min_stock: number; // Alert threshold

  @Column({ default: 'unidad', length: 50 })
  unit: string; // unidad, kg, litro, metro, caja, etc.

  @Column({ nullable: true })
  barcode: string;

  @Column({ nullable: true })
  image_url: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: true })
  track_stock: boolean; // Some services don't need stock tracking

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => SaleItem, (i) => i.product)
  sale_items: SaleItem[];

  @OneToMany(() => InventoryMovement, (m) => m.product)
  movements: InventoryMovement[];
}
