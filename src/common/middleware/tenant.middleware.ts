import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { Company } from '../../modules/companies/entities/company.entity';
import { MemoryCacheService } from '../../shared/services/cache.service';

/**
 * Clave de cache para el `Company` resuelto en cada request.
 * Se exporta para que servicios como Wompi puedan invalidar la entrada
 * apenas modifican el estado de suscripción de una empresa — sin esto
 * la UI tarda hasta 60s en reflejar el pago.
 */
export const tenantCompanyCacheKey = (companyId: string) =>
  `tenant:company:${companyId}`;

/**
 * Resolves the tenant company for every authenticated request.
 *
 * Performance: companies change rarely, so we cache them in-memory by
 * company_id for 60 seconds. This eliminates an extra DB roundtrip on
 * every API call while still picking up subscription/branding changes
 * within a minute. El cache vive en `MemoryCacheService` (global) para
 * que módulos como Wompi puedan invalidar la entrada al activar un pago.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly TTL_MS = 60_000; // 60s

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly cache: MemoryCacheService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // CORS preflight requests don't carry the auth header — skip work.
    if (req.method === 'OPTIONS') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      const cacheKey = tenantCompanyCacheKey(payload.company_id);
      let company = this.cache.get<Company>(cacheKey) ?? null;

      if (!company) {
        company = await this.companyRepo.findOne({
          where: { id: payload.company_id },
        });
        if (company) this.cache.set(cacheKey, company, this.TTL_MS);
      }

      if (!company) throw new UnauthorizedException('Empresa no encontrada');

      req['company'] = company;
      req['user'] = payload;
    } catch {
      // Token invalid — let JwtAuthGuard handle it per-route.
    }

    next();
  }
}
