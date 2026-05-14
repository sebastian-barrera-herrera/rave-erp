import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { CustomRole } from '../../roles/entities/custom-role.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Invitación pendiente para que un email se una a una empresa.
 *
 * Flujo:
 *   1. Admin invita: se crea Invitation y se envía email con un token plano
 *      (solo el hash queda en DB).
 *   2. El invitado abre el link → frontend llama GET /auth/invitation/:token
 *      → muestra form para fijar contraseña.
 *   3. Frontend envía POST /auth/accept-invitation { token, password, name }
 *      → se crea User y se marca la invitación como aceptada.
 */
@Entity('invitations')
@Index(['company_id', 'email'])
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ length: 200 })
  email: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  /** Si está seteado, sus permisos sobrescriben los del role base. */
  @Column({ type: 'uuid', nullable: true })
  custom_role_id: string | null;

  @ManyToOne(() => CustomRole, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'custom_role_id' })
  custom_role: CustomRole | null;

  /** SHA-256 del token plano. El token se envía solo por email. */
  @Index()
  @Column({ length: 64 })
  @Exclude()
  token_hash: string;

  @Column()
  invited_by_user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by_user_id' })
  invited_by: User;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
