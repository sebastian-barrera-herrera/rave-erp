import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { CustomRole } from '../roles/entities/custom-role.entity';
import { Company } from '../companies/entities/company.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { CreateUserDto, UpdateUserDto, UpdateMyProfileDto, FilterUsersDto } from './dto/user.dto';
import { InviteUserDto } from '../auth/dto/invitation.dto';
import { ROLE_PERMISSIONS } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { MailService } from '../../shared/services/mail.service';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CustomRole)
    private readonly roleRepo: Repository<CustomRole>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateUserDto, companyId: string) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    let customRole: CustomRole | null = null;
    if (dto.custom_role_id) {
      customRole = await this.roleRepo.findOne({
        where: { id: dto.custom_role_id, company_id: companyId },
      });
      if (!customRole) throw new BadRequestException('Rol personalizado no encontrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const permissions = customRole?.permissions?.length
      ? customRole.permissions
      : ROLE_PERMISSIONS[dto.role] || [];

    const user = this.userRepo.create({
      ...dto,
      company_id: companyId,
      password_hash: passwordHash,
      custom_permissions: permissions,
    });
    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  async findAll(companyId: string, filters: FilterUsersDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<User> = { company_id: companyId };
    if (filters.role) where.role = filters.role;
    if (typeof filters.is_active === 'boolean') where.is_active = filters.is_active;

    // Listado: campos mínimos del usuario y solo id+nombre del custom_role.
    // password_hash y refresh_token_hash quedan fuera por @Exclude + ClassSerializer.
    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoin('u.custom_role', 'cr')
      .select([
        'u.id', 'u.name', 'u.email', 'u.role',
        'u.avatar_url', 'u.phone', 'u.is_active',
        'u.last_login_at', 'u.created_at',
        'cr.id', 'cr.name',
      ])
      .where('u.company_id = :companyId', { companyId })
      .andWhere('u.deleted_at IS NULL');

    if (filters.role) qb.andWhere('u.role = :role', { role: filters.role });
    if (typeof filters.is_active === 'boolean')
      qb.andWhere('u.is_active = :active', { active: filters.is_active });
    if (filters.search)
      qb.andWhere('(u.name ILIKE :s OR u.email ILIKE :s)', { s: `%${filters.search}%` });

    qb.skip(skip).take(limit).orderBy('u.created_at', 'DESC');

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const user = await this.userRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['custom_role'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto, companyId: string) {
    const user = await this.userRepo.findOne({ where: { id, company_id: companyId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.custom_role_id) {
      const role = await this.roleRepo.findOne({
        where: { id: dto.custom_role_id, company_id: companyId },
      });
      if (!role) throw new BadRequestException('Rol personalizado no encontrado');
      user.custom_permissions = role.permissions;
    } else if (dto.role) {
      user.custom_permissions = ROLE_PERMISSIONS[dto.role] || [];
    }

    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  async remove(id: string, companyId: string) {
    const user = await this.userRepo.findOne({ where: { id, company_id: companyId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.userRepo.softDelete(id);
    return { message: 'Usuario eliminado correctamente' };
  }

  /**
   * Auto-actualización del perfil. Solo campos seguros (nombre, foto, contacto,
   * cédula, dirección). Cambiar role/permisos/is_active sigue requiriendo
   * users:manage por el endpoint admin.
   */
  async updateMyProfile(userId: string, companyId: string, dto: UpdateMyProfileDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId, company_id: companyId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.avatar_url !== undefined) user.avatar_url = dto.avatar_url;
    if (dto.document_number !== undefined) user.document_number = dto.document_number;
    if (dto.address !== undefined) user.address = dto.address;

    const saved = await this.userRepo.save(user);
    return this.sanitize(saved);
  }

  private sanitize(user: User) {
    const { password_hash, refresh_token_hash, ...safe } = user as any;
    return safe;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Invitaciones
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Crea una invitación pendiente y envía el correo con el link de aceptación.
   * Reglas:
   *   - El email no puede pertenecer ya a un usuario activo de la misma empresa.
   *   - Si ya hay una invitación pendiente para ese email en esta empresa,
   *     la revocamos y emitimos una nueva (rotación de token).
   *   - Si se envía custom_role_id, debe pertenecer a la misma empresa.
   */
  async invite(dto: InviteUserDto, companyId: string, invitedByUserId: string) {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email, company_id: companyId },
    });
    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con ese email en la empresa');
    }

    if (dto.custom_role_id) {
      const role = await this.roleRepo.findOne({
        where: { id: dto.custom_role_id, company_id: companyId },
      });
      if (!role) throw new BadRequestException('Rol personalizado no encontrado');
    }

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    const inviter = await this.userRepo.findOne({ where: { id: invitedByUserId } });
    if (!inviter) throw new NotFoundException('Usuario invitador no encontrado');

    // Si hay invitación pendiente previa (no aceptada, no revocada, no vencida),
    // la revocamos para emitir un nuevo token.
    await this.invitationRepo
      .createQueryBuilder()
      .update(Invitation)
      .set({ revoked_at: new Date() })
      .where('company_id = :companyId', { companyId })
      .andWhere('email = :email', { email: dto.email })
      .andWhere('accepted_at IS NULL')
      .andWhere('revoked_at IS NULL')
      .execute();

    // Generamos token plano (se envía por correo) y guardamos solo su SHA-256.
    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86400_000);

    const invitation = this.invitationRepo.create({
      company_id: companyId,
      email: dto.email,
      role: dto.role,
      custom_role_id: dto.custom_role_id ?? null,
      token_hash: tokenHash,
      invited_by_user_id: invitedByUserId,
      expires_at: expiresAt,
    });
    const saved = await this.invitationRepo.save(invitation);

    // Envío de correo no bloqueante; si falla, la invitación queda creada y
    // el admin puede reenviarla.
    this.mailService
      .sendInvitation(dto.email, company.name, inviter.name, dto.role, tokenPlain, expiresAt)
      .catch(() => {/* logged inside mailService */});

    return {
      id: saved.id,
      email: saved.email,
      role: saved.role,
      expires_at: saved.expires_at,
      created_at: saved.created_at,
    };
  }

  async listInvitations(companyId: string) {
    return this.invitationRepo
      .createQueryBuilder('i')
      .leftJoin('i.invited_by', 'u')
      .leftJoin('i.custom_role', 'cr')
      .select([
        'i.id', 'i.email', 'i.role', 'i.expires_at',
        'i.accepted_at', 'i.revoked_at', 'i.created_at',
        'u.id', 'u.name',
        'cr.id', 'cr.name',
      ])
      .where('i.company_id = :companyId', { companyId })
      .orderBy('i.created_at', 'DESC')
      .getMany();
  }

  async revokeInvitation(id: string, companyId: string) {
    const invitation = await this.invitationRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.accepted_at) {
      throw new BadRequestException('La invitación ya fue aceptada');
    }
    if (invitation.revoked_at) return { message: 'Invitación ya estaba revocada' };

    invitation.revoked_at = new Date();
    await this.invitationRepo.save(invitation);
    return { message: 'Invitación revocada' };
  }

  /** Reenvía el correo: rota el token (revoca el anterior y emite uno nuevo). */
  async resendInvitation(id: string, companyId: string, invitedByUserId: string) {
    const invitation = await this.invitationRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.accepted_at) {
      throw new BadRequestException('La invitación ya fue aceptada');
    }
    return this.invite(
      { email: invitation.email, role: invitation.role, custom_role_id: invitation.custom_role_id ?? undefined },
      companyId,
      invitedByUserId,
    );
  }
}
