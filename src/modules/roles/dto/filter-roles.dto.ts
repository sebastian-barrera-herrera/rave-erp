// ─────────────────────────────────────────────────────────────────────────────
// FilterRolesDto — paginación y búsqueda para el listado de custom roles
// ─────────────────────────────────────────────────────────────────────────────
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterRolesDto {
  @ApiPropertyOptional({ description: 'Buscar por nombre o descripción' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado activo/inactivo' })
  @IsOptional() @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, description: 'Máximo 100' })
  @IsOptional()
  limit?: number;
}
