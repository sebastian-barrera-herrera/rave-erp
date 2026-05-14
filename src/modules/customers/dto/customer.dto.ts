// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Customers (clientes finales de la empresa)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsEmail, IsBoolean, IsDateString, IsNumber, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmploymentCertificateDto {
  @ApiPropertyOptional({ example: 'Auxiliar contable' })
  @IsOptional() @IsString()
  position?: string;

  @ApiProperty({ example: '2024-03-15' })
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional() @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ example: 1800000 })
  @IsOptional() @IsNumber() @Min(0)
  salary?: number;

  @ApiPropertyOptional({ example: 'Término indefinido' })
  @IsOptional() @IsString()
  contract_type?: string;

  @ApiPropertyOptional({ example: 'Bogotá, D.C.' })
  @IsOptional() @IsString()
  issued_in?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'juan.perez@gmail.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+57 310 555 1234' })
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Calle 80 #11-23, Bogotá' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '1.012.345.678' })
  @IsOptional() @IsString()
  document_number?: string;

  @ApiPropertyOptional({ example: 'CC', description: 'Tipo de documento (CC, NIT, CE, PASAPORTE)' })
  @IsOptional() @IsString()
  document_type?: string;

  @ApiPropertyOptional({ example: 'Cliente VIP, descuento 5%' })
  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Juan Pérez García' })
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'juan.perez@gmail.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  document_number?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  document_type?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  is_active?: boolean;
}

export class FilterCustomersDto {
  @ApiPropertyOptional({ description: 'Texto a buscar en nombre/email/teléfono', example: 'juan' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado activo' })
  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, example: 20, description: 'Máximo 100' })
  @IsOptional()
  limit?: number;
}
