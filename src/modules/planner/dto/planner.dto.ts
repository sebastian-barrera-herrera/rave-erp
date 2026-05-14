// ─────────────────────────────────────────────────────────────────────────────
// DTOs del Planeador (DailyPlan + PlanTask + PlanVisit)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, Min, IsUUID,
  IsDateString, MaxLength, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTaskPriority, PlanVisitStatus } from '../../../common/types/enums';

// ───────────────────── Plan ──────────────────────
export class UpsertDailyPlanDto {
  @ApiProperty({
    example: '2026-05-08',
    description: 'Fecha del plan (formato YYYY-MM-DD). Una sola fecha por usuario.',
  })
  @IsDateString()
  plan_date: string;

  @ApiPropertyOptional({ example: 'Día enfocado en clientes del norte de la ciudad.' })
  @IsOptional() @IsString()
  notes?: string;
}

export class FilterPlansDto {
  @ApiPropertyOptional({
    example: '2026-05-01',
    description: 'Filtrar planes con plan_date >= date_from',
  })
  @IsOptional() @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional() @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({
    description: 'UUID de otro usuario. Requiere permiso `planner:view_all`. '
      + 'Si se omite se devuelven los planes del usuario autenticado.',
  })
  @IsOptional() @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 30, description: 'Máximo 100' })
  @IsOptional()
  limit?: number;
}

// ───────────────────── Tasks ──────────────────────
export class CreatePlanTaskDto {
  @ApiProperty({ example: 'Llamar al proveedor X' })
  @IsString() @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Confirmar pedido de la próxima semana' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: PlanTaskPriority, default: PlanTaskPriority.MEDIUM })
  @IsOptional() @IsEnum(PlanTaskPriority)
  priority?: PlanTaskPriority;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdatePlanTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: PlanTaskPriority })
  @IsOptional() @IsEnum(PlanTaskPriority)
  priority?: PlanTaskPriority;

  @ApiPropertyOptional({
    description: 'true → marca como hecho (set done_at=now); false → reabre.',
  })
  @IsOptional() @IsBoolean()
  is_done?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  order?: number;
}

// ───────────────────── Visits ──────────────────────
export class CreatePlanVisitDto {
  @ApiPropertyOptional({
    description: 'UUID de un cliente registrado. Si se envía, customer_name '
      + 'y address se autocompletan desde el cliente (puedes sobrescribirlos).',
  })
  @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre del cliente o prospecto. Requerido si no envías customer_id.',
    example: 'Distribuidora La Esquina',
  })
  @IsOptional() @IsString() @MaxLength(200)
  customer_name?: string;

  @ApiPropertyOptional({ example: 'Cra. 13 #45-67, Bogotá' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: '10:30',
    description: 'Hora estimada (HH:MM en 24h).',
  })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'scheduled_time debe tener formato HH:MM (24h)',
  })
  scheduled_time?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional() @IsInt() @Min(0)
  order?: number;
}

export class UpdatePlanVisitDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  customer_name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '10:30' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'scheduled_time debe tener formato HH:MM (24h)',
  })
  scheduled_time?: string;

  @ApiPropertyOptional({ enum: PlanVisitStatus })
  @IsOptional() @IsEnum(PlanVisitStatus)
  status?: PlanVisitStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  order?: number;
}
