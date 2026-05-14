// ─────────────────────────────────────────────────────────────────────────────
// DTO para actualizar la empresa propia (settings de la cuenta)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsEmail, IsNumber, IsEnum, Min, Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CountryCode } from '../../../common/types/country-settings';

export class UpdateCompanyDto {
  @ApiPropertyOptional({
    enum: CountryCode,
    example: CountryCode.CO,
    description: 'País ISO-2. Si se envía, autocompleta moneda, tax_rate y tax_label '
      + '(salvo que se envíen también explícitamente).',
  })
  @IsOptional() @IsEnum(CountryCode)
  country?: CountryCode;

  @ApiPropertyOptional({ example: 'Distribuidora El Sol S.A.S.' })
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'contacto@distribuidora-elsol.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Cra. 7 #23-45, Bogotá' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'COP' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 0.19, description: 'Tasa de impuesto (0–1)' })
  @IsOptional() @IsNumber() @Min(0) @Max(1)
  tax_rate?: number;

  @ApiPropertyOptional({ example: 'https://cdn.miempresa.com/logo.png' })
  @IsOptional() @IsString()
  logo_url?: string;

  @ApiPropertyOptional({ example: 'https://distribuidora-elsol.com' })
  @IsOptional() @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'IVA', description: 'Etiqueta local del impuesto' })
  @IsOptional() @IsString()
  tax_label?: string;

  @ApiPropertyOptional({ example: '900.123.456-7' })
  @IsOptional() @IsString()
  tax_id?: string;

  // ── Branding ───────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '358 74% 43%', description: 'Color primario HSL "h s% l%"' })
  @IsOptional() @IsString()
  primary_color?: string;

  @ApiPropertyOptional({ example: '358 74% 43%', description: 'Color de acento HSL "h s% l%"' })
  @IsOptional() @IsString()
  accent_color?: string;

  @ApiPropertyOptional({ example: 'Mi Empresa', description: 'Nombre visible para el branding (puede diferir del oficial)' })
  @IsOptional() @IsString()
  display_name?: string;

  @ApiPropertyOptional({ example: 'https://cdn.miempresa.com/banner.png' })
  @IsOptional() @IsString()
  banner_url?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  show_banner?: boolean;
}
