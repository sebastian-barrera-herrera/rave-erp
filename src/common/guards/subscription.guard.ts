import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionStatus } from '../types/enums';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const company = request.company;

    if (!company) return true; // Public route

    const { subscription_status, trial_ends_at } = company;

    if (subscription_status === SubscriptionStatus.TRIAL) {
      if (new Date() > new Date(trial_ends_at)) {
        throw new ForbiddenException(
          'Tu período de prueba ha expirado. Activa tu suscripción para continuar.',
        );
      }
      return true;
    }

    if (subscription_status === SubscriptionStatus.ACTIVE) return true;

    if (subscription_status === SubscriptionStatus.PAST_DUE) {
      throw new ForbiddenException(
        'Tu suscripción tiene un pago pendiente. Actualiza tu método de pago.',
      );
    }

    if (subscription_status === SubscriptionStatus.CANCELED) {
      throw new ForbiddenException(
        'Tu suscripción ha sido cancelada. Reactiva tu plan para continuar.',
      );
    }

    return false;
  }
}
