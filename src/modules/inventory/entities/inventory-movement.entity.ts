import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { MovementType } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column()
  product_id: string;

  @ManyToOne(() => Product, (p) => p.movements)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column()
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  sale_id: string;

  @ManyToOne(() => Sale, { nullable: true })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  /** Bodega afectada por el movimiento. Nullable para datos legacy. */
  @Column({ type: 'uuid', nullable: true })
  warehouse_id: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse | null;

  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  @Column('int')
  quantity: number;

  @Column('int')
  stock_before: number;

  @Column('int')
  stock_after: number;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  reference: string; // e.g. purchase order number

  @CreateDateColumn()
  created_at: Date;
}
