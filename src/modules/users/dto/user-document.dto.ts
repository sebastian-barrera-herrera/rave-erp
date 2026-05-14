import { IsEnum, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserDocumentType } from '../entities/user-document.entity';

export class UploadUserDocumentDto {
  @ApiProperty({ enum: UserDocumentType, example: UserDocumentType.MEDICAL_LEAVE })
  @IsEnum(UserDocumentType)
  type!: UserDocumentType;

  @ApiProperty({ example: 'Incapacidad médica – 3 días' })
  @IsString() @MaxLength(200)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2026-05-10' })
  @IsOptional() @IsDateString()
  issued_at?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional() @IsDateString()
  expires_at?: string;
}
