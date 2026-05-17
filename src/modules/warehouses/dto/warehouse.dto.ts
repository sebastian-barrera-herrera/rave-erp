// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Warehouses (bodegas) y stock por bodega
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsBoolean, IsInt, Min, IsUUID, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Bodega Principal' })
  @IsString() @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'PRINCIPAL',
    description: 'Código corto único por empresa (mayúsculas y guiones)',
  })
  @IsString() @MaxLength(30)
  code: string;

  @ApiPropertyOptional({ example: 'Calle 80 #11-23, Bogotá' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Si es false, los productos de esta bodega no se ofrecen para venta.',
  })
  @IsOptional() @IsBoolean()
  is_sellable?: boolean;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  code?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_sellable?: boolean;
}

export class AdjustWarehouseStockDto {
  @ApiProperty({ description: 'UUID del producto' })
  @IsUUID()
  product_id: string;

  @ApiProperty({
    description: 'Cantidad a fijar (absoluta) en esta bodega para este producto.',
    example: 50, minimum: 0,
  })
  @IsInt() @Min(0)
  stock: number;

  @ApiPropertyOptional({
    description: 'Stock mínimo de alerta para este producto en esta bodega.',
    example: 5, minimum: 0,
  })
  @IsOptional() @IsInt() @Min(0)
  min_stock?: number;

  @ApiPropertyOptional({ example: 'Conteo físico inicial' })
  @IsOptional() @IsString()
  reason?: string;
}

export class TransferStockDto {
  @ApiProperty({ description: 'UUID bodega origen' })
  @IsUUID()
  from_warehouse_id: string;

  @ApiProperty({ description: 'UUID bodega destino' })
  @IsUUID()
  to_warehouse_id: string;

  @ApiProperty({ description: 'UUID del producto a transferir' })
  @IsUUID()
  product_id: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'Reabastecimiento sucursal' })
  @IsOptional() @IsString()
  reason?: string;
}

class BulkTransferItemDto {
  @ApiProperty({ description: 'UUID del producto a transferir' })
  @IsUUID()
  product_id: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;
}

export class BulkTransferStockDto {
  @ApiProperty({ description: 'UUID bodega origen' })
  @IsUUID()
  from_warehouse_id: string;

  @ApiProperty({ description: 'UUID bodega destino' })
  @IsUUID()
  to_warehouse_id: string;

  @ApiProperty({
    description: 'Lista de productos a transferir',
    type: [BulkTransferItemDto],
  })
  items: BulkTransferItemDto[];

  @ApiPropertyOptional({ example: 'Reabastecimiento sucursal' })
  @IsOptional() @IsString()
  reason?: string;
}
