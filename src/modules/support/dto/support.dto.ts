// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Support — tickets de soporte interno (entre usuarios y staff)
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsString, IsOptional, IsEnum, MinLength, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketType, TicketStatus, TicketPriority } from '../../../common/types/enums';

export class CreateTicketDto {
  @ApiProperty({
    enum: TicketType,
    example: TicketType.QUESTION,
    description: 'CLAIM, COMPLAINT, SUGGESTION, QUESTION, OTHER',
  })
  @IsEnum(TicketType)
  type: TicketType;

  @ApiProperty({
    example: '¿Cómo cancelar una venta ya completada?',
    minLength: 5,
    maxLength: 300,
  })
  @IsString() @MinLength(5) @MaxLength(300)
  subject: string;

  @ApiProperty({
    example: 'Hicimos una venta hace 3 días pero el cliente la canceló. ¿Cómo procedo?',
    minLength: 10,
  })
  @IsString() @MinLength(10)
  message: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  @IsOptional() @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional() @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional() @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class AddMessageDto {
  @ApiProperty({ example: 'Gracias por la respuesta, intenté lo que sugieren y funcionó.' })
  @IsString() @MinLength(1)
  message: string;
}

export class FilterTicketsDto {
  @ApiPropertyOptional({ enum: TicketType })
  @IsOptional() @IsEnum(TicketType)
  type?: TicketType;

  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional() @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional() @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'Buscar en asunto o número de ticket' })
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  date_from?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  date_to?: string;

  @ApiPropertyOptional({ default: 1 }) @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional()
  limit?: number;
}
