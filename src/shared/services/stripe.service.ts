import {
  Injectable,
  OnModuleInit,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Wrapper sobre el SDK de Stripe. En producción Rave cobra a través de
 * Wompi (Colombia); Stripe queda como camino alternativo para clientes
 * internacionales y por ahora está oculto en la UI. Por eso este servicio
 * es **opcional**: si no hay `STRIPE_SECRET_KEY`, el módulo arranca igual
 * y cualquier llamada a Stripe falla con 503 en tiempo de uso (no al boot).
 *
 * Antes esto lanzaba `throw` en `onModuleInit`, lo que tumbaba todo el
 * proceso de Nest al desplegar sin la clave configurada — comportamiento
 * indeseable porque la app debe funcionar 100% con solo Wompi.
 */
@Injectable()
export class StripeService implements OnModuleInit {
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secret = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      this.logger.warn(
        'STRIPE_SECRET_KEY no configurada — Stripe queda inactivo. ' +
          'Los pagos seguirán funcionando a través de Wompi.',
      );
      return;
    }
    this.stripe = new Stripe(secret, {
      apiVersion: '2023-10-16',
    });
    this.logger.log('Stripe SDK inicializado');
  }

  /** ¿Está Stripe disponible? Útil si un endpoint quiere decidir antes de llamar. */
  isEnabled(): boolean {
    return this.stripe !== null;
  }

  private ensureEnabled(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe no está disponible en este servidor. Usa Wompi para procesar pagos.',
      );
    }
    return this.stripe;
  }

  async createCustomer(name: string, email: string): Promise<Stripe.Customer> {
    return this.ensureEnabled().customers.create({ name, email });
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.ensureEnabled().checkout.sessions.create(params);
  }

  async createBillingPortal(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.ensureEnabled().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.ensureEnabled().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.ensureEnabled().subscriptions.retrieve(subscriptionId);
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.ensureEnabled().webhooks.constructEvent(payload, signature, secret);
  }
}
