// ─────────────────────────────────────────────────────────────────────────────
// CompaniesController — perfil de la empresa autenticada
// ─────────────────────────────────────────────────────────────────────────────
// Cada usuario sólo accede a su propia empresa (multi-tenant via JWT).
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from './entities/company.entity';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('company')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('countries')
  @ApiOperation({
    summary: 'Catálogo de países soportados (LATAM + España)',
    description: 'Devuelve para cada país: code (ISO-2), name, currency, tax_rate, tax_label, '
      + 'phone_prefix y locale. Útil para poblar el selector al crear/editar la empresa.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { code: 'CO', name: 'Colombia', currency: 'COP', tax_rate: 0.19, tax_label: 'IVA', phone_prefix: '+57', locale: 'es-CO' },
        { code: 'MX', name: 'México',   currency: 'MXN', tax_rate: 0.16, tax_label: 'IVA', phone_prefix: '+52', locale: 'es-MX' },
      ],
    },
  })
  listCountries() {
    return this.companiesService.listCountries();
  }

  @Get()
  @ApiOperation({ summary: 'Datos de la empresa autenticada' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        id: 'uuid', name: 'Distribuidora El Sol', slug: 'distribuidora-el-sol',
        email: 'admin@distribuidora-elsol.com', currency: 'COP', tax_rate: 0.19,
        subscription_status: 'TRIAL', trial_ends_at: new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString(),
      },
    },
  })
  findOne(@CurrentCompany() company: Company) {
    return this.companiesService.findOne(company.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Estadísticas globales de la empresa',
    description: 'Conteo de usuarios, clientes, productos, ventas y total facturado.',
  })
  getStats(@CurrentCompany() company: Company) {
    return this.companiesService.getStats(company.id);
  }

  @Patch()
  @Permissions(Permission.COMPANY_SETTINGS)
  @ApiOperation({ summary: 'Actualizar datos de la empresa' })
  @ApiBody({ type: UpdateCompanyDto })
  update(@CurrentCompany() company: Company, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(company.id, dto);
  }
}
