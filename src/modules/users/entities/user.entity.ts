import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '../../../common/types/enums';
import { Company } from '../../companies/entities/company.entity';
import { CustomRole } from '../../roles/entities/custom-role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  company_id!: string;

  @ManyToOne(() => Company, (c) => c.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @Column({ length: 200 })
  name!: string;

  @Column({ unique: true, length: 200 })
  email!: string;

  @Column()
  @Exclude()
  password_hash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.EMPLOYEE })
  role!: UserRole;

  /**
   * Optional custom role — if set, custom_role.permissions override
   * the built-in ROLE_PERMISSIONS for this user.
   */
  @Column({ nullable: true })
  custom_role_id!: string;

  @ManyToOne(() => CustomRole, (r) => r.users, { nullable: true, eager: false })
  @JoinColumn({ name: 'custom_role_id' })
  custom_role!: CustomRole;

  /**
   * Resolved at login: populated from custom_role.permissions if set,
   * otherwise from ROLE_PERMISSIONS[role]. Stored in JWT payload.
   */
  @Column('simple-array', { default: '' })
  custom_permissions!: string[];

  @Column({ nullable: true })
  avatar_url!: string;

  @Column({ nullable: true })
  phone!: string;

  /** Cédula / documento de identidad. Editable por el propio usuario. */
  @Column({ nullable: true, length: 50 })
  document_number!: string;

  @Column({ nullable: true })
  address!: string;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ nullable: true })
  last_login_at!: Date;

  @Column({ nullable: true })
  @Exclude()
  refresh_token_hash!: string;

  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  password_reset_token_hash!: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  @Exclude()
  password_reset_expires_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at!: Date;
}
