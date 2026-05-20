import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Company } from '../companies/entities/company.entity';
import { SubscriptionStatus, SubscriptionPlan } from '../../common/types/enums';
import { CreateCheckoutDto } from './dto/subscription.dto';
import { MailService } from '../../shared/services/mail.service';
import { StripeService } from '../../shared/services/stripe.service';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  /** Maps our plan enum to Stripe Price IDs from env */
  private readonly PLAN_PRICE_MAP: Record<SubscriptionPlan, string | undefined>;

  /** Human-readable plan labels */
  private readonly PLAN_LABELS: Record<SubscriptionPlan, string> = {
    [SubscriptionPlan.MONTHLY]: 'Mensual',
    [SubscriptionPlan.QUARTERLY]: 'Trimestral',
    [SubscriptionPlan.YEARLY]: 'Anual',
  };

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly stripeService: StripeService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.PLAN_PRICE_MAP = {
      [SubscriptionPlan.MONTHLY]: this.configService.get('STRIPE_PRICE_MONTHLY'),
      [SubscriptionPlan.QUARTERLY]: this.configService.get('STRIPE_PRICE_QUARTERLY'),
      [SubscriptionPlan.YEARLY]: this.configService.get('STRIPE_PRICE_YEARLY'),
    };
  }

  /**
   * Si una empresa en TRIAL tiene `trial_ends_at` muy lejos en el futuro
   * (heredado de un `STRIPE_TRIAL_DAYS` antiguo o de un cambio manual en
   * DB), lo recortamos a la duración configurada actualmente y persistimos
   * la corrección. Así la UI nunca muestra "120 días restantes" cuando el
   * trial real son 3.
   */
  private async normalizeTrial(company: Company): Promise<Company> {
    if (company.subscription_status !== SubscriptionStatus.TRIAL) return company;
    if (!company.trial_ends_at) return company;
    // Number() forzoso: configService devuelve la env como string.
    // Sin esto, `getDate() + trialDays` hacía string concat y la
    // normalización "arreglaba" el trial a +183 días en lugar de a +3.
    const trialDays = Number(this.configService.get('STRIPE_TRIAL_DAYS', 3)) || 3;
    const maxAllowed = trialDays + 1; // tolerancia de 1 día por redondeos
    const msDiff = new Date(company.trial_ends_at).getTime() - Date.now();
    const daysDiff = Math.ceil(msDiff / 86400000);
    if (daysDiff <= maxAllowed) return company;

    this.logger.warn(
      `Empresa ${company.id} tenía trial de ${daysDiff} días — normalizando a ${trialDays}`,
    );
    const fixedEnd = new Date();
    fixedEnd.setDate(fixedEnd.getDate() + trialDays);
    company.trial_ends_at = fixedEnd;
    // Si el subscription_ends_at apuntaba al mismo trial, lo alineamos.
    if (
      !company.subscription_ends_at ||
      new Date(company.subscription_ends_at).getTime() >
        Date.now() + (trialDays + 1) * 86400000
    ) {
      company.subscription_ends_at = fixedEnd;
    }
    await this.companyRepo.save(company);
    return company;
  }

  async getStatus(company: Company) {
    company = await this.normalizeTrial(company);
    const now = new Date();
    const trialLeft = company.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - now.getTime()) / 86400000))
      : 0;
    const daysLeft = company.subscription_ends_at
      ? Math.max(0, Math.ceil((new Date(company.subscription_ends_at).getTime() - now.getTime()) / 86400000))
      : 0;

    return {
      status: company.subscription_status,
      plan: company.subscription_plan,
      plan_label: company.subscription_plan
        ? this.PLAN_LABELS[company.subscription_plan]
        : null,
      trial_ends_at: company.trial_ends_at,
      // Inicio del trial = fecha de creación de la empresa (es el primer día).
      // La UI lo usa para calcular la barra de progreso correctamente sin
      // tener que adivinar la duración total del trial.
      trial_started_at: company.created_at ?? null,
      trial_days_total: Number(this.configService.get('STRIPE_TRIAL_DAYS', 3)) || 3,
      trial_days_left: trialLeft,
      subscription_started_at: company.subscription_started_at ?? null,
      subscription_ends_at: company.subscription_ends_at,
      subscription_days_left: daysLeft,
      cancel_at: company.subscription_cancel_at ?? null,
      pending_cancellation: !!company.subscription_cancel_at,
      next_billing_date: company.next_billing_date,
      payment_method: company.stripe_subscription_id
        ? 'stripe'
        : (company.subscription_plan ? 'wompi' : null),
      plans: this.getAvailablePlans(),
    };
  }

  /**
   * Tabla de precios en COP. La fuente de verdad para Stripe sigue siendo
   * el `STRIPE_PRICE_*` configurado en `.env`; este valor es el que se
   * muestra en la UI (resumen, comparativa de planes, etc.).
   *
   *   Mensual:    $10.000 / mes              → $10.000 total
   *   Trimestral: $9.000 / mes  (10% off)    → $27.000 total
   *   Anual:      $8.000 / mes  (20% off)    → $96.000 total
   */
  getAvailablePlans() {
    return [
      {
        id: SubscriptionPlan.MONTHLY,
        name: 'Mensual',
        duration: '1 mes',
        description: 'Facturación mensual, cancela cuando quieras',
        price_amount: 10000,
        total_amount: 10000,
        monthly_amount: 10000,
        currency: 'COP',
        savings: null,
        discount_percent: 0,
      },
      {
        id: SubscriptionPlan.QUARTERLY,
        name: 'Trimestral',
        duration: '3 meses',
        description: 'Ahorra 10% pagando cada trimestre',
        price_amount: 27000,
        total_amount: 27000,
        monthly_amount: 9000,
        currency: 'COP',
        savings: '10% de ahorro',
        discount_percent: 10,
      },
      {
        id: SubscriptionPlan.YEARLY,
        name: 'Anual',
        duration: '12 meses',
        description: 'Ahorra 20% pagando el año completo',
        price_amount: 96000,
        total_amount: 96000,
        monthly_amount: 8000,
        currency: 'COP',
        savings: '20% de ahorro',
        discount_percent: 20,
      },
    ];
  }

  async createCheckout(dto: CreateCheckoutDto, company: Company) {
    const priceId = this.PLAN_PRICE_MAP[dto.plan];
    if (!priceId) throw new BadRequestException(`Plan "${dto.plan}" no configurado en Stripe`);

    if (!company.stripe_customer_id) {
      const customer = await this.stripeService.createCustomer(company.name, company.email);
      company.stripe_customer_id = customer.id;
      await this.companyRepo.save(company);
    }

    const frontendUrl = this.configService.get('FRONTEND_URL');

    const session = await this.stripeService.createCheckoutSession({
      customer: company.stripe_customer_id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${frontendUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/subscription?checkout=canceled`,
      subscription_data: {
        metadata: {
          company_id: company.id,
          plan: dto.plan,
        },
      },
      metadata: { company_id: company.id, plan: dto.plan },
    });

    return { checkout_url: session.url, session_id: session.id };
  }

  async createPortal(company: Company, returnUrl?: string) {
    if (!company.stripe_customer_id) {
      throw new BadRequestException('No se encontró cliente de Stripe para esta empresa');
    }
    const frontendUrl = this.configService.get('FRONTEND_URL');
    const portal = await this.stripeService.createBillingPortal(
      company.stripe_customer_id,
      returnUrl || `${frontendUrl}/dashboard`,
    );
    return { portal_url: portal.url };
  }

  /**
   * Cancela la suscripción del usuario. Si pagó por Stripe, agenda la
   * cancelación al final del período actual via API. Si pagó por Wompi (no
   * hay subscription recurrente — son pagos one-shot), simplemente marca la
   * fecha de cancelación local: el acceso se conserva hasta `subscription_ends_at`
   * y a partir de ahí queda CANCELED.
   */
  async cancel(company: Company) {
    if (company.subscription_status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Solo se puede cancelar una suscripción activa',
      );
    }

    const endsAt = company.subscription_ends_at ?? new Date();

    if (company.stripe_subscription_id) {
      try {
        await this.stripeService.cancelSubscription(company.stripe_subscription_id);
      } catch (err: any) {
        this.logger.warn(`Cancelación Stripe falló: ${err?.message}`);
      }
    }

    company.subscription_cancel_at = new Date();
    await this.companyRepo.save(company);

    return {
      message:
        'Suscripción cancelada. Mantendrás acceso hasta ' +
        new Date(endsAt).toLocaleDateString('es-CO'),
      cancel_at: company.subscription_cancel_at,
      ends_at: endsAt,
    };
  }

  /** Reactiva una cancelación pendiente — útil cuando el usuario se arrepiente. */
  async resume(company: Company) {
    if (!company.subscription_cancel_at) {
      throw new BadRequestException('No hay una cancelación pendiente');
    }
    company.subscription_cancel_at = null as unknown as Date;
    await this.companyRepo.save(company);
    return { message: 'Suscripción reactivada' };
  }

  // ─── Webhook handler (called from controller after signature verification) ──
  async handleWebhookEvent(event: Stripe.Event) {
    this.logger.log(`Stripe event received: ${event.type}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleSubscriptionUpsert(subscription: Stripe.Subscription) {
    const companyId = subscription.metadata?.company_id;
    if (!companyId) return;

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return;

    const plan = subscription.metadata?.plan as SubscriptionPlan;
    const periodEnd = new Date(subscription.current_period_end * 1000);
    const nextBilling = new Date(subscription.current_period_end * 1000);

    let status: SubscriptionStatus;
    switch (subscription.status) {
      case 'active':
      case 'trialing':
        status = SubscriptionStatus.ACTIVE;
        break;
      case 'past_due':
        status = SubscriptionStatus.PAST_DUE;
        break;
      case 'canceled':
      case 'unpaid':
        status = SubscriptionStatus.CANCELED;
        break;
      default:
        status = SubscriptionStatus.PAST_DUE;
    }

    company.stripe_subscription_id = subscription.id;
    company.subscription_status = status;
    company.subscription_plan = plan;
    company.subscription_ends_at = periodEnd;
    company.next_billing_date = nextBilling;
    // Marcamos el inicio del plan sólo la primera vez que entra el evento
    // (status pasa a ACTIVE) para no resetearlo en cada update del periodo.
    if (status === SubscriptionStatus.ACTIVE && !company.subscription_started_at) {
      company.subscription_started_at = new Date();
    }
    // Si el usuario había pedido cancelar y vuelve a tener un evento activo,
    // limpiamos la marca local — quiere decir que renovó.
    if (status === SubscriptionStatus.ACTIVE && company.subscription_cancel_at) {
      company.subscription_cancel_at = null as unknown as Date;
    }

    await this.companyRepo.save(company);
    this.logger.log(`Company ${company.name} subscription → ${status} (${plan})`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const companyId = subscription.metadata?.company_id;
    if (!companyId) return;

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return;

    company.subscription_status = SubscriptionStatus.CANCELED;
    company.stripe_subscription_id = null as unknown as string;
    await this.companyRepo.save(company);

    this.mailService
      .sendSubscriptionCanceled(company.email, company.name)
      .catch((e) => this.logger.warn(`Cancel email failed: ${e.message}`));
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const company = await this.companyRepo.findOne({
      where: { stripe_customer_id: customerId },
    });
    if (!company) return;

    company.subscription_status = SubscriptionStatus.ACTIVE;
    const periodEnd = (invoice as any).lines?.data?.[0]?.period?.end;
    if (periodEnd) {
      company.subscription_ends_at = new Date(periodEnd * 1000);
      company.next_billing_date = new Date(periodEnd * 1000);
    }

    await this.companyRepo.save(company);
    this.logger.log(`Invoice paid — company ${company.name} → ACTIVE`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const company = await this.companyRepo.findOne({
      where: { stripe_customer_id: customerId },
    });
    if (!company) return;

    company.subscription_status = SubscriptionStatus.PAST_DUE;
    await this.companyRepo.save(company);

    this.mailService
      .sendPaymentFailed(company.email, company.name)
      .catch((e) => this.logger.warn(`Payment failed email: ${e.message}`));

    this.logger.warn(`Payment failed — company ${company.name} → PAST_DUE`);
  }
}
