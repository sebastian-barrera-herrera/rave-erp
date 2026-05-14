// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Debts (cuentas por cobrar)
// ─────────────────────────────────────────────────────────────────────────────
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DebtStatus } from '../../../common/types/enums';

export class UpdateDebtDto {
  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Nueva fecha límite de pago (YYYY-MM-DD).',
  })
  @IsOptional() @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ description: 'Notas internas sobre la deuda.' })
  @IsOptional() @IsString()
  notes?: string;
}

export class FilterDebtsDto {
  @ApiPropertyOptional({ enum: DebtStatus, description: 'PENDING | PARTIAL | PAID | OVERDUE' })
  @IsOptional() @IsEnum(DebtStatus)
  status?: DebtStatus;

  @ApiPropertyOptional({ description: 'UUID del cliente' })
  @IsOptional() @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional() @IsString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional() @IsString()
  date_to?: string;

  @ApiPropertyOptional({
    description: 'Si es true, sólo deudas vencidas y no pagadas',
    example: false,
  })
  @IsOptional()
  overdue_only?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
