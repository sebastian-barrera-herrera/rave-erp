import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Company } from '../../companies/entities/company.entity';
import { User } from './user.entity';

export enum UserDocumentType {
  MEDICAL_LEAVE = 'MEDICAL_LEAVE',
  AFFILIATION = 'AFFILIATION',
  ID = 'ID',
  CONTRACT = 'CONTRACT',
  TRAINING = 'TRAINING',
  OTHER = 'OTHER',
}

/**
 * Documento cargado por (o sobre) un miembro del equipo: incapacidades,
 * papeles de afiliación, contratos, certificaciones, etc.
 *
 * Se guarda el archivo binario directamente en la base de datos (`bytea`)
 * para mantener el flujo simple — un PDF/imagen pesa típicamente <1 MB.
 * Si más adelante crece el volumen se puede migrar a S3 manteniendo este
 * mismo contrato de API.
 */
@Entity('user_documents')
export class UserDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  company_id!: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column()
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ nullable: true })
  uploaded_by_id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by!: User;

  @Column({ type: 'enum', enum: UserDocumentType, default: UserDocumentType.OTHER })
  type!: UserDocumentType;

  @Column({ length: 200 })
  title!: string;

  @Column({ nullable: true })
  description!: string;

  @Column({ length: 255 })
  file_name!: string;

  @Column({ length: 100 })
  mime_type!: string;

  @Column({ type: 'int' })
  size!: number;

  @Column({ type: 'bytea' })
  @Exclude()
  data!: Buffer;

  @Column({ type: 'date', nullable: true })
  issued_at!: string | null;

  @Column({ type: 'date', nullable: true })
  expires_at!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at!: Date;
}
