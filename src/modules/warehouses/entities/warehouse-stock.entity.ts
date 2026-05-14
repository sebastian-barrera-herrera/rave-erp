import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Product } from '../../products/entities/product.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Stock de un producto en una bodega específica.
 * El stock plano de Product.stock se mantiene como "stock total"
 * (suma sobre bodegas) por compatibilidad con queries existentes.
 */
@Entity('warehouse_stocks')
@Unique('UQ_warehouse_stocks_wh_product', ['warehouse_id', 'product_id'])
@Index('IDX_warehouse_stocks_company', ['company_id'])
export class WarehouseStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  warehouse_id: string;

  @ManyToOne(() => Warehouse, (w) => w.stocks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column()
  product_id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column('int', { default: 0 })
  stock: number;

  @Column('int', { default: 0 })
  min_stock: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
