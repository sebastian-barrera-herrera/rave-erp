// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Payments — pagos aplicados sobre deudas (créditos a cobrar)
// ─────────────────────────────────────────────────────────────────────────────
import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../../common/types/enums';

export class CreatePaymentDto {
  @ApiProperty({
    example: 100000,
    description: 'Monto a abonar — debe ser ≤ remaining_amount de la deuda',
    minimum: 0.01,
  })
  @IsNumber() @Min(0.01)
  amount: number;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'Forma de pago: CASH, CARD, TRANSFER, CHECK, OTHER',
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    example: 'TRANSF-20260506-0931',
    description: 'Número de referencia/comprobante (opcional)',
  })
  @IsOptional() @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Pago parcial mes mayo' })
  @IsOptional() @IsString()
  notes?: string;
}

export class FilterPaymentsDto {
  @ApiPropertyOptional({ description: 'UUID de la deuda asociada' })
  @IsOptional() @IsString()
  debt_id?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional() @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional() @IsString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional() @IsString()
  date_to?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
