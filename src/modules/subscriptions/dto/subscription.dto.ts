// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Subscriptions (Stripe)
// ─────────────────────────────────────────────────────────────────────────────
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan } from '../../../common/types/enums';

export class CreateCheckoutDto {
  @ApiProperty({
    enum: SubscriptionPlan,
    example: SubscriptionPlan.MONTHLY,
    description: 'Plan al que el usuario quiere suscribirse',
  })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;
}

export class CreatePortalDto {
  @ApiPropertyOptional({
    example: 'https://miapp.com/dashboard',
    description: 'URL a la que volver tras salir del portal de Stripe',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  return_url?: string;
}
