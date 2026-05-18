// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Returns (devoluciones de venta + averías de inventario)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min,
  IsInt, IsUUID, IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnType } from '../../../common/types/enums';

export class ReturnItemDto {
  @ApiPropertyOptional({ description: 'UUID del producto. Requerido si afecta inventario.' })
  @IsOptional() @IsUUID()
  product_id?: string;

  @ApiProperty({ example: 'Tornillo 1/4', description: 'Snapshot del nombre' })
  @IsString()
  product_name: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional() @IsNumber() @Min(0)
  unit_price?: number;

  @ApiPropertyOptional({ example: 'Cliente reporta defecto de fábrica' })
  @IsOptional() @IsString()
  reason?: string;
}

export class CreateReturnDto {
  @ApiProperty({ enum: ReturnType, example: ReturnType.SALE_RETURN })
  @IsEnum(ReturnType)
  type: ReturnType;

  @ApiPropertyOptional({
    description:
      'UUID de la venta original (solo SALE_RETURN). Si se incluye se ' +
      'autocompletan customer_id, warehouse_id y se valida que los productos ' +
      'pertenezcan a esa venta.',
  })
  @IsOptional() @IsUUID()
  sale_id?: string;

  @ApiPropertyOptional({ description: 'Cliente que devuelve (solo SALE_RETURN).' })
  @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({
    description:
      'Bodega a la cual reingresan los productos (SALE_RETURN) o de la cual ' +
      'se descuentan (DAMAGE). Si se omite se usa la principal.',
  })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ example: 'Producto llegó con empaque roto' })
  @IsOptional() @IsString()
  reason?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}

export class FilterReturnsDto {
  @ApiPropertyOptional({ enum: ReturnType })
  @IsOptional() @IsEnum(ReturnType)
  type?: ReturnType;

  @ApiPropertyOptional({ description: 'Buscar por motivo / notas' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  warehouse_id?: string;

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
