import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomRole } from './entities/custom-role.entity';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/custom-role.dto';
import { FilterRolesDto } from './dto/filter-roles.dto';
import { Permission, ROLE_PERMISSIONS, UserRole } from '../../common/types/enums';
import { User } from '../users/entities/user.entity';
import { paginate } from '../../common/types/pagination.type';
import { MemoryCacheService } from '../../shared/services/cache.service';

const PERMISSIONS_CACHE_KEY = 'roles:available-permissions';
const PERMISSIONS_TTL = 60 * 60 * 1000; // 1h — el catálogo es estático
const ROLES_LIST_TTL = 30 * 1000; // 30s

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(CustomRole)
    private readonly roleRepo: Repository<CustomRole>,
    private readonly cache: MemoryCacheService,
  ) {}

  async create(dto: CreateCustomRoleDto, companyId: string) {
    const existing = await this.roleRepo.findOne({
      where: { company_id: companyId, name: dto.name },
    });
    if (existing) throw new BadRequestException(`Ya existe un rol con el nombre "${dto.name}"`);

    const role = this.roleRepo.create({ ...dto, company_id: companyId });
    const saved = await this.roleRepo.save(role);
    this.cache.invalidatePrefix(`roles:list:${companyId}:`);
    return saved;
  }

  async findAll(companyId: string, filters: FilterRolesDto) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
    const search = filters.search?.trim() ?? '';
    const isActive = typeof filters.is_active === 'boolean' ? filters.is_active : null;

    const cacheKey = `roles:list:${companyId}:${page}:${limit}:${search}:${isActive ?? ''}`;

    return this.cache.wrap(cacheKey, ROLES_LIST_TTL, async () => {
      const qb = this.roleRepo
        .createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.deleted_at IS NULL')
        .loadRelationCountAndMap('r.users_count', 'r.users')
        .select([
          'r.id',
          'r.name',
          'r.description',
          'r.permissions',
          'r.is_active',
          'r.created_at',
          'r.updated_at',
        ])
        .orderBy('r.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (search) {
        qb.andWhere('(r.name ILIKE :s OR r.description ILIKE :s)', { s: `%${search}%` });
      }
      if (isActive !== null) qb.andWhere('r.is_active = :active', { active: isActive });

      const [data, total] = await qb.getManyAndCount();
      return paginate(data, total, page, limit);
    });
  }

  async findOne(id: string, companyId: string) {
    const role = await this.roleRepo.findOne({
      where: { id, company_id: companyId },
      // `users` se carga eagerly para que el detalle del rol muestre los
      // miembros sin un segundo round-trip. Es relación @OneToMany — solo
      // los users con custom_role_id = role.id.
      relations: ['users'],
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    // Recortamos campos sensibles de los miembros (no exponemos password
    // hash, refresh tokens, etc.) — solo lo necesario para listar.
    (role as any).members = (role.users || [])
      .filter((u: any) => !u.deleted_at)
      .map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url,
      }));
    delete (role as any).users;
    return role;
  }

  /**
   * Devuelve los roles incorporados (ADMIN, MANAGER, CASHIER, etc.) con
   * sus permisos por defecto + cuántos miembros tiene cada uno en esta
   * empresa. Útil para mostrar en la UI junto a los roles personalizados.
   */
  async listBuiltInRoles(companyId: string) {
    const LABELS: Record<UserRole, string> = {
      [UserRole.ADMIN]: 'Administrador',
      [UserRole.MANAGER]: 'Gerente',
      [UserRole.SELLER]: 'Vendedor',
      [UserRole.CASHIER]: 'Cajero',
      [UserRole.EMPLOYEE]: 'Empleado',
    };
    const DESCRIPTIONS: Record<UserRole, string> = {
      [UserRole.ADMIN]: 'Acceso total. No se puede editar.',
      [UserRole.MANAGER]: 'Gestiona la mayoría de módulos sin tocar facturación ni equipo.',
      [UserRole.SELLER]: 'Vende, cotiza y cobra. Sin acceso a reportes profundos ni configuración.',
      [UserRole.CASHIER]: 'Solo punto de venta y cobros. Sin gestión de inventario.',
      [UserRole.EMPLOYEE]: 'Solo lectura. No puede modificar nada.',
    };

    const rows: Array<{
      key: UserRole;
      name: string;
      description: string;
      permissions: Permission[];
      members_count: number;
      builtin: true;
    }> = [];
    for (const role of Object.values(UserRole)) {
      // ADMIN tiene "todos los permisos" — lo enumeramos completo para que la
      // UI no muestre "0 permisos". El guard de permisos hace bypass para
      // ADMIN igual, esto es solo cosmético.
      const perms =
        role === UserRole.ADMIN
          ? Object.values(Permission)
          : ROLE_PERMISSIONS[role] || [];
      const countRow = (await this.roleRepo.manager
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .from(User, 'u')
        .where('u.company_id = :companyId', { companyId })
        .andWhere('u.role = :role', { role })
        .andWhere('u.deleted_at IS NULL')
        .getRawOne()) as { count: string } | undefined;
      rows.push({
        key: role,
        name: LABELS[role],
        description: DESCRIPTIONS[role],
        permissions: perms,
        members_count: Number(countRow?.count ?? 0),
        builtin: true,
      });
    }
    return rows;
  }

  /**
   * Miembros que tienen asignado un rol incorporado en esta empresa.
   * Se devuelven solo los campos seguros para listar (sin password hash).
   */
  async listBuiltInRoleMembers(role: UserRole, companyId: string) {
    const rows: any[] = await this.roleRepo.manager
      .createQueryBuilder()
      .select(['u.id AS id', 'u.name AS name', 'u.email AS email', 'u.avatar_url AS avatar_url'])
      .from(User, 'u')
      .where('u.company_id = :companyId', { companyId })
      .andWhere('u.role = :role', { role })
      .andWhere('u.deleted_at IS NULL')
      .orderBy('u.name', 'ASC')
      .getRawMany();
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar_url: u.avatar_url,
    }));
  }

  async update(id: string, dto: UpdateCustomRoleDto, companyId: string) {
    const role = await this.findOne(id, companyId);
    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);
    this.cache.invalidatePrefix(`roles:list:${companyId}:`);
    return saved;
  }

  async remove(id: string, companyId: string) {
    const role = await this.findOne(id, companyId);
    await this.roleRepo.softDelete(id);
    this.cache.invalidatePrefix(`roles:list:${companyId}:`);
    return { message: `Rol "${role.name}" eliminado` };
  }

  // El catálogo de permisos es estático: lo cacheamos a nivel proceso.
  getAvailablePermissions() {
    return this.cache.wrap(PERMISSIONS_CACHE_KEY, PERMISSIONS_TTL, async () =>
      Object.entries(Permission).map(([key, value]) => ({
        key,
        value,
        module: value.split(':')[0],
        action: value.split(':')[1],
      })),
    );
  }
}
