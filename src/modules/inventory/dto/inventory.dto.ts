// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Inventory — movimientos de stock por bodega
// ─────────────────────────────────────────────────────────────────────────────
import { IsString, IsOptional, IsEnum, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '../../../common/types/enums';

export class AdjustInventoryDto {
  @ApiProperty({ example: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456' })
  @IsUUID()
  product_id: string;

  @ApiPropertyOptional({
    description: 'Bodega afectada por el movimiento. Si se omite se usa la bodega principal.',
  })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiProperty({
    enum: MovementType,
    example: MovementType.IN,
    description:
      'IN = entrada de stock, OUT = salida manual, ADJUSTMENT = fija el stock al valor `quantity`. '
      + 'TRANSFER_IN/OUT solo se generan internamente vía /warehouses/transfer.',
  })
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({ example: 20, minimum: 1, description: 'Cantidad de unidades a mover (o stock final si type=ADJUSTMENT).' })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Compra a proveedor X' })
  @IsOptional() @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'FAC-PROV-2026-0421' })
  @IsOptional() @IsString()
  reference?: string;
}

export class FilterMovementsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({ description: 'UUID de la bodega' })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ description: 'UUID del usuario que generó el movimiento' })
  @IsOptional() @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional() @IsEnum(MovementType)
  type?: MovementType;

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
