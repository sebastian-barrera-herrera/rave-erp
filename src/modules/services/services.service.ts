import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ServiceEntity } from './entities/service.entity';
import {
  CreateServiceDto, UpdateServiceDto, FilterServicesDto,
} from './dto/service.dto';
import { paginate } from '../../common/types/pagination.type';
import { ServiceStatus } from '../../common/types/enums';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly serviceRepo: Repository<ServiceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateServiceDto, companyId: string) {
    const MAX_RETRIES = 5;
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const serviceNumber = await this.generateServiceNumber(companyId, attempt);
        const entity = this.serviceRepo.create({
          ...dto,
          company_id: companyId,
          service_number: serviceNumber,
          status: dto.status ?? ServiceStatus.COMPLETED,
          scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
          completed_at: dto.completed_at ? new Date(dto.completed_at) : null,
        });
        return await this.serviceRepo.save(entity);
      } catch (err: any) {
        const isDuplicate =
          err?.code === '23505' ||
          /duplicate key value/i.test(err?.message ?? '') ||
          /service_number/i.test(err?.message ?? '');
        if (isDuplicate && attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 80 + attempt * 60));
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async findAll(companyId: string, filters: FilterServicesDto) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.serviceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'c')
      .leftJoinAndSelect('s.worker', 'w')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.deleted_at IS NULL');

    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('s.customer_id = :cid', { cid: filters.customer_id });
    if (filters.worker_id) qb.andWhere('s.worker_id = :wid', { wid: filters.worker_id });
    if (filters.category) qb.andWhere('s.category = :cat', { cat: filters.category });
    if (filters.search)
      qb.andWhere(
        '(s.service_type ILIKE :q OR s.description ILIKE :q OR s.service_number ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    if (filters.date_from)
      qb.andWhere('s.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to)
      qb.andWhere('s.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('s.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string) {
    const service = await this.serviceRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['customer', 'worker'],
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  async update(id: string, dto: UpdateServiceDto, companyId: string) {
    const service = await this.findOne(id, companyId);
    Object.assign(service, {
      ...dto,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : service.scheduled_at,
      completed_at: dto.completed_at ? new Date(dto.completed_at) : service.completed_at,
    });
    return this.serviceRepo.save(service);
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.serviceRepo.softDelete(id);
    return { message: 'Servicio eliminado' };
  }

  async categories(companyId: string) {
    const rows = await this.serviceRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.category', 'category')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.category IS NOT NULL')
      .andWhere('s.deleted_at IS NULL')
      .getRawMany();
    return rows.map((r) => r.category).filter(Boolean);
  }

  private async generateServiceNumber(companyId: string, attempt = 0): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SVC-${year}-`;
    const result = await this.dataSource
      .createQueryBuilder()
      .select('MAX(s.service_number)', 'max')
      .from(ServiceEntity, 's')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.service_number LIKE :prefix', { prefix: `${prefix}%` })
      .withDeleted()
      .getRawOne();
    const maxNumber: string | null = result?.max ?? null;
    let next = 1;
    if (maxNumber) {
      const numericPart = maxNumber.replace(prefix, '');
      const parsed = parseInt(numericPart, 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }
    next += attempt;
    return `${prefix}${String(next).padStart(6, '0')}`;
  }
}
