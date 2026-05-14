// ─────────────────────────────────────────────────────────────────────────────
// WompiTransaction Entity
// ─────────────────────────────────────────────────────────────────────────────
// Representa una transacción de pago realizada a través de Wompi (pasarela de
// pago colombiana). Cada vez que el usuario inicia un checkout, se crea un
// registro local con la referencia y el estado, que luego se actualiza cuando
// Wompi notifica vía webhook el resultado final (APPROVED / DECLINED / VOIDED).
//
// Tabla: wompi_transactions
// ─────────────────────────────────────────────────────────────────────────────
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { SubscriptionPlan } from '../../../common/types/enums';

/**
 * Estados posibles de una transacción Wompi.
 * Reflejan los estados oficiales del API de Wompi:
 * https://docs.wompi.co/docs/colombia/estados-y-firma-de-eventos/
 */
export enum WompiTransactionStatus {
  /** Transacción creada localmente pero aún no procesada en Wompi */
  PENDING = 'PENDING',
  /** Transacción aprobada por el banco / red de pagos */
  APPROVED = 'APPROVED',
  /** Transacción rechazada (saldo insuficiente, fraude, etc.) */
  DECLINED = 'DECLINED',
  /** Transacción anulada (reverso) */
  VOIDED = 'VOIDED',
  /** Error técnico durante el procesamiento */
  ERROR = 'ERROR',
}

@Entity('wompi_transactions')
@Index(['company_id', 'reference'])
export class WompiTransaction {
  /** Identificador interno de la transacción (UUID v4) */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK hacia la empresa que originó el pago — multi-tenant */
  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /**
   * Referencia única generada por nosotros — la enviamos a Wompi y
   * Wompi la devuelve en el webhook para identificar la transacción.
   * Formato sugerido: ERP-{companyId}-{plan}-{timestamp}
   */
  @Column({ unique: true, length: 200 })
  reference: string;

  /** ID de la transacción tal como lo asigna Wompi (puede ser null hasta el webhook) */
  @Column({ nullable: true, length: 100 })
  wompi_transaction_id: string;

  /** Plan de suscripción al que corresponde el pago */
  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    nullable: true,
  })
  plan: SubscriptionPlan;

  /** Monto en la unidad menor de la moneda (centavos para COP) */
  @Column('bigint')
  amount_in_cents: number;

  /** Moneda ISO 4217 — Wompi soporta principalmente COP */
  @Column({ length: 3, default: 'COP' })
  currency: string;

  /** Email del pagador, usado por Wompi para notificaciones */
  @Column({ length: 200 })
  customer_email: string;

  /** Estado actual de la transacción — se actualiza vía webhook */
  @Column({
    type: 'enum',
    enum: WompiTransactionStatus,
    default: WompiTransactionStatus.PENDING,
  })
  status: WompiTransactionStatus;

  /**
   * Método de pago utilizado (CARD, NEQUI, PSE, BANCOLOMBIA_TRANSFER, etc.)
   * Solo se conoce después de que el usuario complete el flujo en Wompi.
   */
  @Column({ nullable: true, length: 50 })
  payment_method_type: string;

  /** URL de checkout de Wompi a la que se redirige al usuario */
  @Column({ nullable: true, type: 'text' })
  checkout_url: string;

  /** Payload completo del último evento de webhook recibido (auditoría) */
  @Column({ type: 'jsonb', nullable: true })
  raw_payload: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
