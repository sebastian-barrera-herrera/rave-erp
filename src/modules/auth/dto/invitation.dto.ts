// ─────────────────────────────────────────────────────────────────────────────
// DTOs del flujo de invitaciones
// ─────────────────────────────────────────────────────────────────────────────
import {
  IsEmail, IsString, MinLength, IsOptional, IsEnum, IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/types/enums';

/** Body que envía el admin para invitar a un nuevo miembro. */
export class InviteUserDto {
  @ApiProperty({ example: 'maria@distribuidora.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.SELLER,
    description: 'Rol base que tendrá el nuevo usuario al aceptar.',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'UUID de un custom role para sobrescribir los permisos del rol base.',
  })
  @IsOptional() @IsUUID()
  custom_role_id?: string;

  @ApiPropertyOptional({
    description: 'Nombre sugerido para el invitado (puede confirmarlo/cambiarlo al aceptar).',
    example: 'María Gómez',
  })
  @IsOptional() @IsString()
  name?: string;
}

/** Body que envía el invitado para aceptar la invitación y fijar contraseña. */
export class AcceptInvitationDto {
  @ApiProperty({
    description: 'Token recibido en el correo de invitación (parámetro `token` del link).',
    example: 'a1b2c3d4...',
  })
  @IsString()
  token: string;

  @ApiProperty({ example: 'María Gómez' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'P@ssw0rdSeguro123', minLength: 8 })
  @IsString() @MinLength(8)
  password: string;
}
