// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Products
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsNumber, Min, IsBoolean, IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Camiseta polo manga corta' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'POLO-AZUL-M', description: 'SKU único dentro de la empresa' })
  @IsString()
  sku: string;

  @ApiPropertyOptional({ example: 'Polo 100% algodón, talla M, color azul rey' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Ropa' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Lacoste' })
  @IsOptional() @IsString()
  brand?: string;

  @ApiProperty({ example: 89000, description: 'Precio de venta (unidad menor de la moneda)' })
  @IsNumber() @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 45000, description: 'Costo de adquisición' })
  @IsOptional() @IsNumber() @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional() @IsInt() @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 10, description: 'Stock mínimo para alerta' })
  @IsOptional() @IsInt() @Min(0)
  min_stock?: number;

  @ApiPropertyOptional({ example: 'unidad' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '7701234567890' })
  @IsOptional() @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 'https://cdn.miempresa.com/products/polo.jpg' })
  @IsOptional() @IsString()
  image_url?: string;

  @ApiPropertyOptional({ example: true, description: 'Si descuenta stock al vender' })
  @IsOptional() @IsBoolean()
  track_stock?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  sku?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  barcode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  image_url?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  stock?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 95000 })
  @IsOptional() @IsNumber() @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 48000 })
  @IsOptional() @IsNumber() @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional() @IsInt() @Min(0)
  min_stock?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  unit?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  track_stock?: boolean;
}

export class FilterProductsDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en nombre/SKU/código de barras', example: 'polo' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Ropa' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Solo productos por debajo del stock mínimo' })
  @IsOptional() @IsBoolean()
  low_stock?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, description: 'Máximo 100' }) @IsOptional()
  limit?: number;
}
