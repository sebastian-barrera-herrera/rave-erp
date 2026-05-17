// ─────────────────────────────────────────────────────────────────────────────
// DTOs de autenticación
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsEmail, IsString, MinLength, IsOptional, IsNumber, IsEnum, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CountryCode } from '../../../common/types/country-settings';

/**
 * Body para registrar una nueva empresa + usuario administrador.
 * Crea ambos en la misma transacción y arranca un trial automático.
 */
export class RegisterDto {
  // ─── Datos de la empresa ───
  @ApiProperty({ example: 'Distribuidora El Sol S.A.S.', description: 'Nombre legal de la empresa' })
  @IsString()
  company_name: string;

  @ApiProperty({ example: 'admin@distribuidora-elsol.com', description: 'Email principal de la empresa' })
  @IsEmail()
  company_email: string;

  @ApiPropertyOptional({ example: 'Cra. 7 #23-45, Bogotá, Colombia' })
  @IsOptional() @IsString()
  company_address?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional() @IsString()
  company_phone?: string;

  @ApiPropertyOptional({ example: '900.123.456-7', description: 'NIT/RUC/RFC según país' })
  @IsOptional() @IsString()
  company_tax_id?: string;

  @ApiPropertyOptional({
    enum: CountryCode,
    example: CountryCode.CO,
    description: 'País ISO-2 (LATAM o España). Si se envía, autocompleta currency, tax_rate '
      + 'y tax_label desde el catálogo. currency/tax_rate explícitos lo sobrescriben.',
  })
  @IsOptional() @IsEnum(CountryCode)
  country?: CountryCode;

  @ApiPropertyOptional({ example: 'COP', description: 'Moneda ISO 4217 — si se omite y hay country, se infiere' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 0.19, description: 'Tasa de impuesto (0–1) — si se omite y hay country, se infiere' })
  @IsOptional() @IsNumber() @Min(0) @Max(1)
  tax_rate?: number;

  // ─── Datos del usuario admin ───
  @ApiProperty({ example: 'Sebastián López', description: 'Nombre completo del admin' })
  @IsString()
  admin_name: string;

  @ApiProperty({ example: 'sebastian@distribuidora-elsol.com' })
  @IsEmail()
  admin_email: string;

  @ApiProperty({
    example: 'P@ssw0rdSeguro123',
    description: 'Mínimo 8 caracteres',
    minLength: 8,
  })
  @IsString() @MinLength(8)
  admin_password: string;
}

/** Body para iniciar sesión */
export class LoginDto {
  @ApiProperty({ example: 'sebastian@distribuidora-elsol.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rdSeguro123' })
  @IsString()
  password: string;
}

/** Body para refrescar el access token */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token recibido al hacer login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  refresh_token: string;
}

/** Body para cambiar la contraseña del usuario autenticado */
export class ChangePasswordDto {
  @ApiProperty({ example: 'P@ssw0rdAnterior123' })
  @IsString()
  current_password: string;

  @ApiProperty({ example: 'P@ssw0rdNueva456', minLength: 8 })
  @IsString() @MinLength(8)
  new_password: string;
}

/** Body para solicitar email de recuperación de contraseña (no requiere auth). */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'sebastian@distribuidora-elsol.com' })
  @IsEmail()
  email: string;
}

/** Body para fijar una nueva contraseña usando el token recibido por email. */
export class ResetPasswordDto {
  @ApiProperty({ example: 'a1b2c3d4...', description: 'Token recibido en el email de recuperación' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'P@ssw0rdNueva456', minLength: 8 })
  @IsString() @MinLength(8)
  new_password: string;
}
