import {
  Injectable, BadRequestException, UnauthorizedException,
  NotFoundException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { CustomRole } from '../roles/entities/custom-role.entity';
import { Invitation } from './entities/invitation.entity';
import {
  RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto,
  ForgotPasswordDto, ResetPasswordDto,
} from './dto/auth.dto';
import { AcceptInvitationDto } from './dto/invitation.dto';
import {
  UserRole, SubscriptionStatus, ROLE_PERMISSIONS, Permission,
} from '../../common/types/enums';
import { StripeService } from '../../shared/services/stripe.service';
import { MailService } from '../../shared/services/mail.service';
import { getCountrySettings } from '../../common/types/country-settings';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.admin_email } });
    if (existing) throw new ConflictException('El email ya está registrado');

    const existingCompany = await this.companyRepo.findOne({
      where: { email: dto.company_email },
    });
    if (existingCompany) throw new ConflictException('Ya existe una empresa con ese email');

    const trialDays = this.configService.get<number>('STRIPE_TRIAL_DAYS', 3);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const slug = dto.company_name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 80) + '-' + Date.now();

    const countryDefaults = getCountrySettings(dto.country);

    // bcrypt fuera de la transacción: es CPU-bound (~200ms) y mantenerlo
    // dentro alarga el lock sin necesidad.
    const passwordHash = await bcrypt.hash(dto.admin_password, 12);

    // Transacción mínima: solo lo verdaderamente atómico (company + user).
    // Stripe, tokens y email salen porque son lentos/externos y bloqueaban
    // la conexión causando el "se queda cargando y arroja error" reportado.
    const { user, company } = await this.dataSource.transaction(async (manager) => {
      const company = manager.create(Company, {
        name: dto.company_name,
        email: dto.company_email,
        slug,
        address: dto.company_address,
        phone: dto.company_phone,
        tax_id: dto.company_tax_id,
        country: dto.country ?? null,
        currency: dto.currency ?? countryDefaults?.currency ?? 'COP',
        tax_rate: dto.tax_rate ?? countryDefaults?.tax_rate ?? 0.19,
        tax_label: countryDefaults?.tax_label ?? 'IVA',
        subscription_status: SubscriptionStatus.TRIAL,
        trial_ends_at: trialEndsAt,
        subscription_ends_at: trialEndsAt,
      });
      await manager.save(company);

      const user = manager.create(User, {
        company_id: company.id,
        name: dto.admin_name,
        email: dto.admin_email,
        password_hash: passwordHash,
        role: UserRole.ADMIN,
        custom_permissions: ROLE_PERMISSIONS[UserRole.ADMIN],
        is_active: true,
      });
      await manager.save(user);

      return { user, company };
    });

    // Stripe customer: best-effort post-commit. Si falla, el usuario ya está
    // creado y puede activar Stripe luego al pagar.
    this.stripeService
      .createCustomer(company.name, company.email)
      .then((customer) =>
        this.companyRepo.update(company.id, { stripe_customer_id: customer.id }),
      )
      .catch((err) =>
        this.logger.warn(
          `Stripe customer creation failed for ${company.email}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    // Email de bienvenida: non-blocking, después del commit.
    this.mailService
      .sendWelcome(dto.admin_email, dto.admin_name, company.name, trialDays)
      .catch((e) => this.logger.warn(`Welcome email failed: ${e.message}`));

    const tokens = await this.generateTokens(user, company);
    return { user: this.sanitizeUser(user), company, tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: ['company', 'custom_role'],
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    // Resolve permissions: custom_role > built-in role
    const permissions: string[] =
      user.custom_role?.permissions?.length
        ? user.custom_role.permissions
        : ROLE_PERMISSIONS[user.role as UserRole] || [];

    user.custom_permissions = permissions;
    user.last_login_at = new Date();
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user, user.company);
    return { user: this.sanitizeUser(user), company: user.company, tokens };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refresh_token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
        relations: ['company', 'custom_role'],
      });
      if (!user || !user.is_active) throw new UnauthorizedException();

      const hashValid = await bcrypt.compare(dto.refresh_token, user.refresh_token_hash || '');
      if (!hashValid) throw new UnauthorizedException('Refresh token inválido');

      const permissions =
        user.custom_role?.permissions?.length
          ? user.custom_role.permissions
          : ROLE_PERMISSIONS[user.role as UserRole] || [];

      user.custom_permissions = permissions;
      const tokens = await this.generateTokens(user, user.company);
      return tokens;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  async logout(userId: string) {
    await this.userRepo.update(userId, { refresh_token_hash: undefined });
    return { message: 'Sesión cerrada correctamente' };
  }

  /**
   * Inicia el flujo de recuperación. Por seguridad SIEMPRE retorna el mismo
   * mensaje, independientemente de si el email existe — así no exponemos qué
   * cuentas están registradas (enumeration attack).
   *
   * Genera un token plano de 32 bytes, guarda solo el hash SHA-256 y envía
   * el plano por email. Expira en 1h.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: ['company'],
    });

    // Respuesta uniforme para no filtrar existencia de cuenta.
    const genericResponse = {
      message: 'Si el correo está registrado, recibirás un email con instrucciones.',
    };

    if (!user || !user.is_active) return genericResponse;

    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    user.password_reset_token_hash = tokenHash;
    user.password_reset_expires_at = expiresAt;
    await this.userRepo.save(user);

    // Email no-bloqueante: si SMTP está caído, el endpoint responde igual y
    // los logs muestran el fallo. No queremos colgar al usuario por SMTP.
    this.mailService
      .sendPasswordReset(user.email, user.name, tokenPlain, expiresAt)
      .catch((e) =>
        this.logger.error(`Password reset email failed for ${user.email}: ${e.message}`),
      );

    return genericResponse;
  }

  /**
   * Valida el token, lo invalida (se usa una sola vez) y actualiza el hash
   * de la contraseña. También limpia el refresh_token_hash para forzar
   * re-login en otras sesiones abiertas.
   */
  async resetPassword(dto: ResetPasswordDto) {
    if (!dto.token || dto.token.length < 32) {
      throw new BadRequestException('Token de recuperación inválido');
    }

    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const user = await this.userRepo.findOne({
      where: { password_reset_token_hash: tokenHash },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o ya utilizado');
    }
    if (!user.password_reset_expires_at || user.password_reset_expires_at.getTime() < Date.now()) {
      // Limpiamos el token vencido para que un siguiente intento no siga
      // viéndolo como "ya utilizado".
      user.password_reset_token_hash = null;
      user.password_reset_expires_at = null;
      await this.userRepo.save(user);
      throw new BadRequestException('El enlace de recuperación expiró. Solicita uno nuevo.');
    }

    user.password_hash = await bcrypt.hash(dto.new_password, 12);
    user.password_reset_token_hash = null;
    user.password_reset_expires_at = null;
    user.refresh_token_hash = undefined as any; // invalida sesiones existentes
    await this.userRepo.save(user);

    return { message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');

    const valid = await bcrypt.compare(dto.current_password, user.password_hash);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');
    user.password_hash = await bcrypt.hash(dto.new_password, 12);
    await this.userRepo.save(user);
    return { message: 'Contraseña actualizada' };
  }

  async me(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['company', 'custom_role'],
    });
    if (!user) return null;

    // Resolver permisos al vuelo: custom_role gana sobre el rol base. Esto
    // garantiza que cambios al rol (o a sus permisos) se reflejen sin que el
    // usuario tenga que cerrar sesión y volver a entrar.
    const permissions: string[] = user.custom_role?.permissions?.length
      ? user.custom_role.permissions
      : ROLE_PERMISSIONS[user.role as UserRole] || [];

    return this.sanitizeUser({ ...user, custom_permissions: permissions } as User);
  }

  private async generateTokens(user: User, company: Company) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      company_id: company.id,
      custom_permissions: user.custom_permissions || [],
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    // Store hashed refresh token
    const refreshHash = await bcrypt.hash(refresh_token, 10);
    await this.userRepo.update(user.id, { refresh_token_hash: refreshHash });

    return { access_token, refresh_token };
  }

  private sanitizeUser(user: User) {
    const { password_hash, refresh_token_hash, ...safe } = user as any;
    // El frontend lee `permissions` (alias del campo interno `custom_permissions`).
    // Mantenemos ambos por compatibilidad con clientes existentes.
    safe.permissions = safe.custom_permissions || [];
    return safe;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Invitaciones (endpoints públicos)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Mira el token plano, lo hashea con SHA-256 y retorna los datos visibles
   * para que el frontend pueda mostrar el formulario de aceptación.
   * NO devuelve nada sensible: solo email, role, nombre de la empresa.
   */
  async getInvitationByToken(tokenPlain: string) {
    const invitation = await this.findValidInvitation(tokenPlain);
    const company = await this.companyRepo.findOne({ where: { id: invitation.company_id } });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    // Devolvemos el branding de la empresa (logo + color) para que la página
    // pública de invitación se sienta parte del producto del cliente y no
    // muestre placeholders genéricos.
    return {
      email: invitation.email,
      role: invitation.role,
      company: {
        id: company.id,
        name: company.name,
        display_name: company.display_name ?? null,
        logo_url: company.logo_url ?? null,
        primary_color: company.primary_color ?? null,
        accent_color: company.accent_color ?? null,
      },
      expires_at: invitation.expires_at,
    };
  }

  /**
   * Crea el User con la contraseña que fija el invitado y devuelve los tokens
   * de sesión, igual que un login. Marca la invitación como aceptada.
   * Si el email ya existe en la empresa (caso poco probable, pero posible si
   * un admin lo creó manualmente entre la invitación y la aceptación),
   * fallamos con ConflictException.
   */
  async acceptInvitation(dto: AcceptInvitationDto) {
    // Hash de la contraseña FUERA de la transacción — bcrypt es CPU-bound y
    // dejarlo dentro alargaba el lock innecesariamente.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { user, company } = await this.dataSource.transaction(async (manager) => {
      const invitation = await this.findValidInvitation(
        dto.token,
        manager.getRepository(Invitation),
      );

      const company = await manager.findOne(Company, {
        where: { id: invitation.company_id },
      });
      if (!company) throw new NotFoundException('Empresa no encontrada');

      // withDeleted: capturamos también usuarios soft-deleted con ese email,
      // porque el UNIQUE en la columna sigue fallando aunque el row esté
      // marcado como borrado.
      const existingUser = await manager.findOne(User, {
        where: { email: invitation.email },
        withDeleted: true,
      });

      // Permisos: custom_role > rol base.
      let permissions: string[] = ROLE_PERMISSIONS[invitation.role as UserRole] || [];
      if (invitation.custom_role_id) {
        const role = await manager.findOne(CustomRole, {
          where: {
            id: invitation.custom_role_id,
            company_id: invitation.company_id,
          },
        });
        if (role?.permissions?.length) permissions = role.permissions;
      }

      let user: User;

      if (existingUser) {
        // Mismo email en la misma empresa: si está activo es un duplicado real;
        // si está soft-deleted, lo reactivamos con la nueva contraseña.
        const sameCompany = existingUser.company_id === invitation.company_id;
        const softDeleted = !!existingUser.deleted_at;

        if (!sameCompany && !softDeleted) {
          throw new ConflictException(
            'El email ya está registrado en otra empresa, intenta iniciar sesión',
          );
        }
        if (sameCompany && !softDeleted) {
          throw new ConflictException(
            'Este correo ya tiene una cuenta activa en la empresa, intenta iniciar sesión',
          );
        }

        existingUser.company_id = invitation.company_id;
        existingUser.name = dto.name;
        existingUser.password_hash = passwordHash;
        existingUser.role = invitation.role;
        existingUser.custom_role_id = invitation.custom_role_id ?? null as any;
        existingUser.custom_permissions = permissions;
        existingUser.is_active = true;
        existingUser.deleted_at = null as any;
        existingUser.last_login_at = new Date();
        user = await manager.save(existingUser);
      } else {
        const created = manager.create(User, {
          company_id: invitation.company_id,
          name: dto.name,
          email: invitation.email,
          password_hash: passwordHash,
          role: invitation.role,
          custom_role_id: invitation.custom_role_id ?? undefined,
          custom_permissions: permissions,
          is_active: true,
          last_login_at: new Date(),
        });
        user = await manager.save(created);
      }

      invitation.accepted_at = new Date();
      await manager.save(invitation);

      return { user, company };
    });

    // Firmar y persistir refresh_token_hash FUERA de la transacción —
    // así trabajamos con la sesión normal y el row recién creado ya está
    // committed y visible.
    try {
      const tokens = await this.generateTokens(user, company);
      return { user: this.sanitizeUser(user), company, tokens };
    } catch (err: any) {
      this.logger.error(
        `acceptInvitation: token generation failed for ${user.email}: ${err?.message}`,
      );
      throw new BadRequestException(
        'No se pudo iniciar la sesión automáticamente. Inicia sesión con tu nueva contraseña.',
      );
    }
  }

  /**
   * Resuelve y valida una invitación a partir del token plano.
   * Reglas: existe, no aceptada, no revocada, no vencida.
   */
  private async findValidInvitation(
    tokenPlain: string,
    repo: Repository<Invitation> = this.invitationRepo,
  ): Promise<Invitation> {
    if (!tokenPlain || tokenPlain.length < 16) {
      throw new BadRequestException('Token de invitación inválido');
    }
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const invitation = await repo.findOne({ where: { token_hash: tokenHash } });
    if (!invitation) throw new NotFoundException('Invitación no encontrada');
    if (invitation.accepted_at) {
      throw new BadRequestException('Esta invitación ya fue aceptada');
    }
    if (invitation.revoked_at) {
      throw new BadRequestException('Esta invitación fue revocada');
    }
    if (invitation.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Esta invitación expiró');
    }
    return invitation;
  }
}
