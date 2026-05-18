import {
  IsString, IsOptional, IsNumber, Min, IsUUID, IsEnum, IsDateString, IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceStatus } from '../../../common/types/enums';

export class CreateServiceDto {
  @ApiProperty({ example: 'Reparación lavadora' })
  @IsString()
  service_type: string;

  @ApiPropertyOptional({ example: 'Electrodomésticos' })
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ServiceStatus, default: ServiceStatus.COMPLETED })
  @IsOptional() @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional({ description: 'UUID del cliente al que se le hizo el servicio.' })
  @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'UUID del trabajador (User del equipo).' })
  @IsOptional() @IsUUID()
  worker_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre libre cuando worker_id no aplica (contratista externo, etc.)',
  })
  @IsOptional() @IsString()
  worker_name?: string;

  @ApiPropertyOptional({ example: 'Cambio de bomba de agua y limpieza' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 120000 })
  @IsOptional() @IsNumber() @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 90, description: 'Duración en minutos' })
  @IsOptional() @IsInt() @Min(0)
  duration_minutes?: number;

  @ApiPropertyOptional({ example: '2026-05-20T14:00:00Z' })
  @IsOptional() @IsDateString()
  scheduled_at?: string;

  @ApiPropertyOptional({ example: '2026-05-20T16:00:00Z' })
  @IsOptional() @IsDateString()
  completed_at?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  service_type?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional() @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  worker_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  worker_name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  cost?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  duration_minutes?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  scheduled_at?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  completed_at?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}

export class FilterServicesDto {
  @ApiPropertyOptional({ enum: ServiceStatus })
  @IsOptional() @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  worker_id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

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
