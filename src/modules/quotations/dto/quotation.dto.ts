// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Quotations (cotizaciones / propuestas comerciales)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsArray, ValidateNested,
  IsNumber, Min, IsInt, IsDateString, IsEnum, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus } from '../../../common/types/enums';

export class QuotationItemDto {
  @ApiPropertyOptional({
    description: 'UUID del producto. Si se envía, se autocompletan descripción y precio',
    example: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456',
  })
  @IsOptional() @IsString()
  product_id?: string;

  @ApiProperty({
    description: 'Descripción del item (libre, no necesariamente un producto del catálogo)',
    example: 'Servicio de instalación e instalación',
  })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'unidad' })
  @IsOptional() @IsString()
  unit?: string;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiProperty({ example: 150000 })
  @IsNumber() @Min(0)
  unit_price: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional() @IsNumber() @Min(0)
  discount?: number;
}

export class CreateQuotationDto {
  @ApiProperty({ example: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56' })
  @IsString()
  customer_id: string;

  @ApiProperty({ type: [QuotationItemDto], description: 'Líneas de la cotización' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items: QuotationItemDto[];

  @ApiPropertyOptional({ example: 0, description: 'Descuento global aplicado al subtotal' })
  @IsOptional() @IsNumber() @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Si es `true`, suma el IVA configurado en la empresa al total. ' +
      'Si es `false`, se cotiza sin IVA. Si se omite, el backend asume `true` ' +
      'por compatibilidad con clientes antiguos.',
  })
  @IsOptional() @IsBoolean()
  apply_tax?: boolean;

  @ApiPropertyOptional({ example: 'Cliente solicitó manejo prioritario' })
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'Forma de pago: 50% anticipo, 50% contra entrega',
    description: 'Términos y condiciones — se imprimen en el PDF',
  })
  @IsOptional() @IsString()
  terms?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Fecha hasta la que es válida la cotización' })
  @IsOptional() @IsDateString()
  valid_until?: string;
}

export class UpdateQuotationDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ type: [QuotationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items?: QuotationItemDto[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Aplicar IVA al recalcular totales' })
  @IsOptional() @IsBoolean()
  apply_tax?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  terms?: string;

  @ApiPropertyOptional({ example: '2026-07-30' })
  @IsOptional() @IsDateString()
  valid_until?: string;

  @ApiPropertyOptional({
    enum: QuotationStatus,
    description: 'DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED',
  })
  @IsOptional() @IsEnum(QuotationStatus)
  status?: QuotationStatus;
}

export class SendQuotationDto {
  @ApiPropertyOptional({
    example: 'Estimado cliente, adjunto encontrará nuestra propuesta...',
    description: 'Mensaje personalizado que se incluye en el cuerpo del correo',
  })
  @IsOptional() @IsString()
  custom_message?: string;
}

export class FilterQuotationsDto {
  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsOptional() @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Buscar por número de cotización', example: 'COT-2026' })
  @IsOptional() @IsString()
  search?: string;

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
