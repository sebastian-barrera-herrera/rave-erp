// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Sales (ventas)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsEnum, IsArray, ValidateNested,
  IsNumber, Min, IsInt, IsDateString, IsUUID, IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleType, PaymentMethod } from '../../../common/types/enums';

export class SaleItemDto {
  @ApiProperty({ description: 'UUID del producto', example: '5e0b1c2a-94f3-4a9d-9b01-7b2dca123456' })
  @IsString()
  product_id: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    example: 89000,
    description: 'Precio unitario — si no se envía, se usa el precio actual del producto',
  })
  @IsOptional() @IsNumber() @Min(0)
  unit_price?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Descuento aplicado a esta línea' })
  @IsOptional() @IsNumber() @Min(0)
  discount?: number;
}

export class CreateSaleDto {
  @ApiProperty({ description: 'UUID del cliente', example: 'c7e0c0e8-0a1b-4d8e-9b65-aa1234abcd56' })
  @IsString()
  customer_id: string;

  @ApiProperty({
    enum: SaleType,
    example: SaleType.CASH,
    description: 'CASH (contado) o CREDIT (a crédito — requiere due_date)',
  })
  @IsEnum(SaleType)
  type: SaleType;

  @ApiProperty({ type: [SaleItemDto], description: 'Líneas de la venta (mínimo 1)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiPropertyOptional({ example: 10000, description: 'Descuento global aplicado al subtotal' })
  @IsOptional() @IsNumber() @Min(0)
  discount?: number;

  @ApiPropertyOptional({ example: 'Cliente solicitó factura electrónica' })
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '2026-06-15',
    description: 'Fecha de vencimiento — REQUERIDA si type=CREDIT',
  })
  @IsOptional() @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({
    description:
      'UUID de la bodega de la cual se descuenta el stock. Si se omite se '
      + 'usa la bodega principal de la empresa.',
  })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({
    description:
      'Monto adelantado al momento de la venta. Solo aplica a `type=CREDIT`. '
      + 'Si > 0, se registra automáticamente como `Payment` contra la deuda y '
      + 'la deuda queda en estado PARTIAL (o PAID si cubre el total).',
    example: 50000,
    minimum: 0,
  })
  @IsOptional() @IsNumber() @Min(0)
  down_payment?: number;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description:
      'Método de pago. Para venta CASH: cómo pagó el cliente. ' +
      'Para venta CREDIT: método del anticipo si hubo (default CASH).',
  })
  @IsOptional() @IsEnum(PaymentMethod)
  down_payment_method?: PaymentMethod;

  @ApiPropertyOptional({
    example: 'TRX-839472',
    description:
      'Número/código de referencia del pago — solo aplica cuando el ' +
      'método no es efectivo (transferencia, Nequi, etc.). Se guarda para ' +
      'conciliación contable.',
  })
  @IsOptional() @IsString()
  payment_reference?: string;

  @ApiPropertyOptional({
    description:
      'Override del impuesto a aplicar (decimal: 0.19 = 19%). Si se omite se usa '
      + 'el `tax_rate` configurado en la empresa. Pasar `0` para venta sin impuesto.',
    example: 0,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional() @IsNumber() @Min(0)
  tax_rate?: number;
}

export class SendSaleDto {
  @ApiPropertyOptional({
    example: 'cliente@empresa.com',
    description:
      'Override del destinatario. Si se omite se usa el email del cliente. '
      + 'Útil cuando el cliente no tiene email registrado o pide enviarlo a otro contacto.',
  })
  @IsOptional() @IsEmail()
  to?: string;

  @ApiPropertyOptional({
    example: 'Adjunto encontrará la factura de su compra. Gracias por su preferencia.',
    description: 'Mensaje personalizado que se incluye en el cuerpo del correo.',
  })
  @IsOptional() @IsString()
  custom_message?: string;
}

export class FilterSalesDto {
  @ApiPropertyOptional({ enum: SaleType })
  @IsOptional() @IsEnum(SaleType)
  type?: SaleType;

  @ApiPropertyOptional({ example: 'COMPLETED', description: 'PENDING | COMPLETED | CANCELED' })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'UUID del cliente para filtrar' })
  @IsOptional() @IsString()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'UUID del vendedor (usuario que registró la venta)' })
  @IsOptional() @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ description: 'UUID de la bodega de origen' })
  @IsOptional() @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Fecha desde (ISO 8601)' })
  @IsOptional() @IsString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional() @IsString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Buscar por número de factura', example: 'INV-2026' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
