// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Remisiones (órdenes de salida)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsArray, IsInt, IsNumber, ValidateNested, Min,
  IsUUID, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RemissionStatus } from '../../../common/types/enums';

export class RemissionItemDto {
  @ApiPropertyOptional({
    description: 'UUID del producto. Opcional: una remisión puede llevar líneas libres '
      + 'cuando no hay un producto registrado.',
  })
  @IsOptional() @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({
    example: 'Camiseta polo azul talla M',
    description: 'Opcional cuando se envía product_id (se autocompleta desde el producto). '
      + 'Requerido para líneas libres (sin product_id).',
  })
  @IsOptional() @IsString()
  product_name?: string;

  @ApiPropertyOptional({ example: 'Despacho parcial — saldo pendiente' })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'unidad', default: 'unidad' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional({
    example: 89000,
    description: 'Precio unitario de referencia (no obligatorio en remisiones).',
  })
  @IsOptional() @IsNumber() @Min(0)
  unit_price?: number;
}

export class CreateRemissionDto {
  @ApiProperty({ description: 'UUID del cliente que recibe la mercancía' })
  @IsUUID()
  customer_id: string;

  @ApiPropertyOptional({
    description: 'Bodega de la cual sale la mercancía. Si se omite, se usa la principal.',
  })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ example: 'Despacho de pedido #1234' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Entregado por transportadora ABC' })
  @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({
    type: [RemissionItemDto],
    description: 'Líneas de la remisión (mínimo 1). Cada una descuenta del stock de la bodega.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemissionItemDto)
  items: RemissionItemDto[];
}

export class FilterRemissionsDto {
  @ApiPropertyOptional({ enum: RemissionStatus })
  @IsOptional() @IsEnum(RemissionStatus)
  status?: RemissionStatus;

  @ApiPropertyOptional({ description: 'UUID del cliente' })
  @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'UUID de la bodega' })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ description: 'UUID del usuario que la generó' })
  @IsOptional() @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional() @IsString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional() @IsString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Buscar por número de remisión' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
