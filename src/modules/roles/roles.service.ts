import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomRole } from './entities/custom-role.entity';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/custom-role.dto';
import { FilterRolesDto } from './dto/filter-roles.dto';
import { Permission } from '../../common/types/enums';
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
    const role = await this.roleRepo.findOne({ where: { id, company_id: companyId } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
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
