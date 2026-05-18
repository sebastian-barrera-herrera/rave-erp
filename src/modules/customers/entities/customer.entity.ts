import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Debt } from '../../debts/entities/debt.entity';
import { CustomerKind } from '../../../common/types/enums';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, (c) => c.customers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  name: string;

  /**
   * Tipo de contacto. Por defecto CUSTOMER para no romper datos existentes;
   * el frontend permite alternar a SUPPLIER o BOTH desde el formulario.
   * Usamos varchar en vez de enum nativo para evitar migraciones costosas
   * cuando se agreguen tipos nuevos.
   */
  @Column({ type: 'varchar', length: 20, default: CustomerKind.CUSTOMER })
  kind: CustomerKind;

  @Column({ nullable: true, length: 200 })
  email: string;

  @Column({ nullable: true, length: 30 })
  phone: string;

  @Column({ nullable: true })
  address: string;

  /** Departamento / provincia / estado. En Colombia: 32 departamentos. */
  @Column({ nullable: true, length: 100 })
  state: string;

  /** Municipio / ciudad. */
  @Column({ nullable: true, length: 100 })
  city: string;

  @Column({ nullable: true, length: 50 })
  document_number: string; // CC, NIT, RUC, etc.

  @Column({ nullable: true, length: 20 })
  document_type: string; // CC, NIT, RUC, Passport

  @Column({ nullable: true })
  notes: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => Sale, (s) => s.customer)
  sales: Sale[];

  @OneToMany(() => Debt, (d) => d.customer)
  debts: Debt[];
}
