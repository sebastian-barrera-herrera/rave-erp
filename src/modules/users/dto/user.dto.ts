// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Users (usuarios internos de la empresa)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsEmail, IsOptional, IsEnum, IsBoolean, MinLength, IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/types/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'María Gómez' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'maria.gomez@miempresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rdSeguro123', minLength: 8 })
  @IsString() @MinLength(8)
  password: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.SELLER,
    description: 'ADMIN, MANAGER, SELLER, CASHIER, EMPLOYEE',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'UUID de un rol personalizado para sobreescribir los permisos del rol base',
  })
  @IsOptional() @IsUUID()
  custom_role_id?: string;

  @ApiPropertyOptional({ example: '+57 310 555 9876' })
  @IsOptional() @IsString()
  phone?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  custom_role_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.miempresa.com/avatars/maria.png' })
  @IsOptional() @IsString()
  avatar_url?: string;
}

/**
 * Auto-update del perfil: cualquier usuario autenticado puede modificar SUS
 * propios datos básicos (nombre, foto, teléfono, documento, dirección).
 * Cambiar role, custom_role_id o is_active SIEMPRE pasa por el endpoint
 * con `users:manage`.
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  avatar_url?: string;

  @ApiPropertyOptional({ description: 'Cédula / documento de identidad' })
  @IsOptional() @IsString()
  document_number?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  address?: string;
}

export class FilterUsersDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Buscar por nombre o email' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
