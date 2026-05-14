import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  COUNTRY_SETTINGS, CountryCode, CountrySettings, getCountrySettings, listCountries,
} from '../../common/types/country-settings';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findOne(id);

    // Si cambia el país y NO se enviaron currency/tax_rate/tax_label
    // explícitos, autocompletamos desde el catálogo de país.
    if (dto.country && dto.country !== company.country) {
      const settings = getCountrySettings(dto.country);
      if (settings) {
        if (dto.currency === undefined) company.currency = settings.currency;
        if (dto.tax_rate === undefined) company.tax_rate = settings.tax_rate;
        if (dto.tax_label === undefined) company.tax_label = settings.tax_label;
      }
    }

    Object.assign(company, dto);
    return this.companyRepo.save(company);
  }

  async getStats(companyId: string) {
    const company = await this.findOne(companyId);
    const daysLeft =
      company.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86400000))
        : null;
    return {
      company,
      subscription: {
        status: company.subscription_status,
        plan: company.subscription_plan,
        trial_days_left: daysLeft,
        ends_at: company.subscription_ends_at,
        next_billing_date: company.next_billing_date,
      },
    };
  }

  /** Catálogo público de países soportados (LATAM + España) con sus defaults. */
  listCountries(): CountrySettings[] {
    return listCountries();
  }

  /** Defaults aplicables a una empresa según su país (helper para `auth.register`). */
  getCountryDefaults(code: CountryCode | string | null | undefined): CountrySettings | null {
    return getCountrySettings(code as string | null);
  }
}
