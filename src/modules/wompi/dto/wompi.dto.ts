// ─────────────────────────────────────────────────────────────────────────────
// DTOs (Data Transfer Objects) del módulo Wompi
// ─────────────────────────────────────────────────────────────────────────────
// Definen la forma de los datos de entrada y salida de la API de pagos Wompi.
// Se decoran con class-validator para validación automática y con
// @ApiProperty (de @nestjs/swagger) para documentación interactiva.
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsEmail,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../../common/types/enums';

/**
 * DTO para iniciar un checkout (link de pago) en Wompi.
 * El frontend llama POST /api/wompi/checkout con este body, y recibe la
 * URL de Wompi a la que debe redirigir al usuario.
 */
export class CreateWompiCheckoutDto {
  @ApiProperty({
    enum: SubscriptionPlan,
    description: 'Plan de suscripción a pagar',
    example: SubscriptionPlan.MONTHLY,
  })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiPropertyOptional({
    description:
      'URL a la que Wompi redirigirá al usuario tras el pago. '
      + 'Si no se envía, se usa FRONTEND_URL configurada en el servidor.',
    example: 'https://miapp.com/dashboard?wompi=success',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  redirect_url?: string;
}

/**
 * DTO opcional para crear una transacción "directa" — se usa si en el futuro
 * se quiere hacer integración server-to-server sin el Checkout Web hospedado
 * de Wompi. No es el flujo principal.
 */
export class CreateWompiTransactionDto {
  @ApiProperty({ description: 'Monto a cobrar en centavos (COP)', example: 5000000 })
  @IsNumber()
  @Min(100)
  amount_in_cents: number;

  @ApiProperty({ description: 'Moneda ISO 4217', example: 'COP' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Email del cliente (lo solicita Wompi)', example: 'cliente@gmail.com' })
  @IsEmail()
  customer_email: string;

  @ApiPropertyOptional({
    description: 'Token de tarjeta (cuando se usa flujo widget client-side)',
  })
  @IsOptional()
  @IsString()
  payment_source_id?: string;
}

/**
 * Forma del payload que Wompi envía al webhook /api/wompi/webhook.
 * Está documentado en https://docs.wompi.co/docs/colombia/eventos/
 */
export class WompiWebhookEventDto {
  @ApiProperty({ example: 'transaction.updated' })
  event: string;

  @ApiProperty({
    description: 'Objeto con la transacción actualizada',
    example: {
      transaction: {
        id: 'wp_test_1234567890',
        reference: 'ERP-abc123-MONTHLY-1700000000000',
        status: 'APPROVED',
        amount_in_cents: 5000000,
        currency: 'COP',
        customer_email: 'admin@miempresa.com',
        payment_method_type: 'CARD',
      },
    },
  })
  data: {
    transaction: {
      id: string;
      reference: string;
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      amount_in_cents: number;
      currency: string;
      customer_email: string;
      payment_method_type?: string;
      [k: string]: unknown;
    };
  };

  @ApiProperty({ example: 1700000000, description: 'Timestamp Unix en segundos' })
  timestamp: number;

  @ApiProperty({ example: 'test', description: 'test | prod' })
  environment: string;

  @ApiProperty({
    description: 'Firma SHA-256 enviada por Wompi para verificar autenticidad',
    example: {
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: 'a3f7b9...',
    },
  })
  signature: {
    properties: string[];
    checksum: string;
  };

  @ApiPropertyOptional({ example: '2' })
  sent_at?: string;
}

/**
 * Respuesta estándar al crear un checkout — se devuelve al frontend.
 */
export class WompiCheckoutResponseDto {
  @ApiProperty({
    description: 'URL hospedada de Wompi a la que redirigir al usuario',
    example: 'https://checkout.wompi.co/l/abcdef123456',
  })
  checkout_url: string;

  @ApiProperty({
    description: 'Referencia única usada para rastrear la transacción',
    example: 'ERP-abc123def456-MONTHLY-1700000000000',
  })
  reference: string;

  @ApiProperty({
    description: 'UUID interno de la transacción en nuestra BD',
    example: 'd1b2c3d4-1234-4567-8901-abcdef123456',
  })
  transaction_id: string;
}
