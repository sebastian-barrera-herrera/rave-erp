// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Custom Roles — roles personalizados con permisos específicos
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsArray, IsBoolean, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Permission } from '../../../common/types/enums';

export class CreateCustomRoleDto {
  @ApiProperty({ example: 'Vendedor de Mostrador' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Vendedor que también gestiona inventario' })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({
    description: 'Lista de permisos otorgados a este rol',
    example: ['products:view', 'sales:view', 'sales:create', 'customers:view'],
    enum: Permission,
    isArray: true,
  })
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions: Permission[];
}

export class UpdateCustomRoleDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Permission, isArray: true })
  @IsOptional() @IsArray()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_active?: boolean;
}
