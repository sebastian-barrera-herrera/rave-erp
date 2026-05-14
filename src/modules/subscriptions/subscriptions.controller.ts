// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionsController — gestión de suscripciones SaaS vía Stripe
// ─────────────────────────────────────────────────────────────────────────────
// Para Colombia, usa el módulo `wompi` en lugar de éste.
// Stripe se usa para clientes internacionales o pagos con tarjeta global.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Headers, Req, Res,
  UseGuards, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiExcludeEndpoint,
} from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto, CreatePortalDto } from './dto/subscription.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';
import { StripeService } from '../../shared/services/stripe.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Subscriptions (Stripe)')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({
    summary: 'Estado actual de la suscripción',
    description: 'Devuelve plan, status, fechas de trial y próxima facturación.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        status: 'TRIAL',
        plan: null,
        trial_ends_at: new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString(),
        trial_days_left: 3,
        subscription_ends_at: new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString(),
        next_billing_date: null,
        plans: [
          { id: 'MONTHLY', name: 'Mensual', duration: '1 mes' },
          { id: 'QUARTERLY', name: 'Trimestral', duration: '3 meses', savings: '~10% ahorro' },
          { id: 'YEARLY', name: 'Anual', duration: '12 meses', savings: '~20% ahorro' },
        ],
      },
    },
  })
  getStatus(@CurrentCompany() company: Company) {
    return this.subscriptionsService.getStatus(company);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar planes disponibles' })
  getPlans() {
    return this.subscriptionsService.getAvailablePlans();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiOperation({
    summary: 'Iniciar checkout de Stripe',
    description: 'Crea una sesión de Stripe Checkout y devuelve la URL para redirigir al navegador.',
  })
  @ApiBody({ type: CreateCheckoutDto })
  @ApiResponse({
    status: 201,
    schema: { example: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_...', session_id: 'cs_test_...' } },
  })
  createCheckout(@Body() dto: CreateCheckoutDto, @CurrentCompany() company: Company) {
    return this.subscriptionsService.createCheckout(dto, company);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Abrir Billing Portal de Stripe',
    description: 'Genera URL al portal de Stripe donde el usuario gestiona método de pago, facturas, etc.',
  })
  @ApiBody({ type: CreatePortalDto })
  createPortal(@Body() dto: CreatePortalDto, @CurrentCompany() company: Company) {
    return this.subscriptionsService.createPortal(company, dto.return_url);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar suscripción',
    description: 'Marca la suscripción para cancelar al final del período en curso (mantiene acceso hasta entonces).',
  })
  cancel(@CurrentCompany() company: Company) {
    return this.subscriptionsService.cancel(company);
  }

  @Post('resume')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reanudar suscripción (revierte una cancelación pendiente)',
  })
  resume(@CurrentCompany() company: Company) {
    return this.subscriptionsService.resume(company);
  }

  /**
   * Webhook de Stripe — usa raw body para validar la firma.
   * Excluido del TenantMiddleware en app.module.ts.
   * Excluido también de Swagger (no se llama desde la UI sino desde Stripe).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    if (!signature) {
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      res.status(500).send('Webhook secret not configured');
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).send('Raw body not available');
      return;
    }

    try {
      const event = this.stripeService.constructWebhookEvent(rawBody, signature, webhookSecret);
      await this.subscriptionsService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Webhook signature verification failed: ${errorMessage}`);
      res.status(400).send(`Webhook Error: ${errorMessage}`);
    }
  }
}
