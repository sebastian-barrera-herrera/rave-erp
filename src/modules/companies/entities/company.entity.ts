import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { SubscriptionStatus, SubscriptionPlan } from '../../../common/types/enums';
import { CountryCode } from '../../../common/types/country-settings';
import { User } from '../../users/entities/user.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Product } from '../../products/entities/product.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Debt } from '../../debts/entities/debt.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { CustomRole } from '../../roles/entities/custom-role.entity';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ unique: true, length: 200 })
  email: string;

  /**
   * ISO 3166-1 alpha-2 — define defaults de moneda, impuesto y prefijo
   * telefónico al crear la empresa (ver `COUNTRY_SETTINGS`).
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: CountryCode | null;

  @Column({ length: 20, default: 'COP' })
  currency: string;

  @Column('decimal', { precision: 5, scale: 4, default: 0.19 })
  tax_rate: number;

  /** Etiqueta del impuesto local: 'IVA', 'IGV', 'ITBIS'... */
  @Column({ type: 'varchar', length: 20, default: 'IVA' })
  tax_label: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  tax_id: string; // NIT, RUC, RFC, etc.

  /**
   * Identidad visual persistida en backend — antes solo vivía en
   * localStorage, así que se perdía al cambiar de equipo o navegador.
   * Formato HSL "h s% l%", ej. "358 74% 43%".
   */
  @Column({ nullable: true, length: 30 })
  primary_color: string;

  @Column({ nullable: true, length: 30 })
  accent_color: string;

  @Column({ nullable: true, length: 200 })
  display_name: string;

  @Column({ nullable: true })
  banner_url: string;

  @Column({ default: false })
  show_banner: boolean;

  /**
   * Tipografía organizacional. Persiste en backend (antes en localStorage)
   * para que toda la empresa vea la misma fuente al iniciar sesión.
   * Valores: 'sm' | 'md' | 'lg' | 'xl' (default 'lg' tras feedback de que
   * la fuente base se veía muy pequeña).
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  font_size: string;

  /**
   * Familia tipográfica. Valores: 'system', 'inter', 'rounded', 'serif',
   * 'mono', 'playful', 'modern', 'elegant', 'tech', 'classic'.
   * NULL = sistema (default).
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  font_family: string;

  @Column({ nullable: true })
  @Exclude()
  stripe_customer_id: string;

  @Column({ nullable: true })
  @Exclude()
  stripe_subscription_id: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  subscription_status: SubscriptionStatus;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    nullable: true,
  })
  subscription_plan: SubscriptionPlan;

  /** Date when the current billing period ends (used for trial and paid plans) */
  @Column({ nullable: true })
  subscription_ends_at: Date;

  /** Trial end date */
  @Column({ nullable: true })
  trial_ends_at: Date;

  /** Fecha en que se activó el plan vigente — la usamos como "inicio del plan". */
  @Column({ nullable: true })
  subscription_started_at: Date;

  /** When the next invoice will be charged */
  @Column({ nullable: true })
  next_billing_date: Date;

  /**
   * Si está seteado y la suscripción aún está ACTIVE, indica que el usuario
   * pidió cancelar pero el acceso sigue hasta `subscription_ends_at`. Se
   * usa para mostrar el aviso "Cancelada — vence el …" en el frontend.
   */
  @Column({ nullable: true })
  subscription_cancel_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToMany(() => User, (u) => u.company)
  users: User[];

  @OneToMany(() => Customer, (c) => c.company)
  customers: Customer[];

  @OneToMany(() => Product, (p) => p.company)
  products: Product[];

  @OneToMany(() => Sale, (s) => s.company)
  sales: Sale[];

  @OneToMany(() => Debt, (d) => d.company)
  debts: Debt[];

  @OneToMany(() => Payment, (p) => p.company)
  payments: Payment[];

  @OneToMany(() => CustomRole, (r) => r.company)
  custom_roles: CustomRole[];
}
