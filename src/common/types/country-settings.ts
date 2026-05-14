// ─────────────────────────────────────────────────────────────────────────────
// CountrySettings — defaults por país (LATAM + España)
// ─────────────────────────────────────────────────────────────────────────────
// Cuando una empresa elige un país, autocompletamos: moneda, tasa de impuesto,
// etiqueta del impuesto (IVA/IGV/ITBIS/...) y prefijo telefónico. El admin
// puede sobrescribir cualquier valor después en la configuración de la empresa.
// ─────────────────────────────────────────────────────────────────────────────

export interface CountrySettings {
  code: CountryCode;
  name: string;
  currency: string;       // ISO 4217
  tax_rate: number;       // 0..1 — IVA/IGV/etc. estándar al momento del seed
  tax_label: string;      // 'IVA', 'IGV', 'ITBIS', 'ICMS', 'ITBMS', 'ISV', 'IVU'
  phone_prefix: string;
  locale: string;         // BCP-47 — útil para formateo en frontend
}

export enum CountryCode {
  AR = 'AR', BO = 'BO', BR = 'BR', CL = 'CL', CO = 'CO',
  CR = 'CR', CU = 'CU', DO = 'DO', EC = 'EC', ES = 'ES',
  GT = 'GT', HN = 'HN', MX = 'MX', NI = 'NI', PA = 'PA',
  PE = 'PE', PR = 'PR', PY = 'PY', SV = 'SV', UY = 'UY', VE = 'VE',
}

// Tasas tomadas del impuesto general estándar al servicio/venta minorista.
// Brasil usa ICMS variable por estado — dejamos 0.17 como referencia común.
export const COUNTRY_SETTINGS: Record<CountryCode, CountrySettings> = {
  [CountryCode.AR]: { code: CountryCode.AR, name: 'Argentina',          currency: 'ARS', tax_rate: 0.21,  tax_label: 'IVA',   phone_prefix: '+54',   locale: 'es-AR' },
  [CountryCode.BO]: { code: CountryCode.BO, name: 'Bolivia',            currency: 'BOB', tax_rate: 0.13,  tax_label: 'IVA',   phone_prefix: '+591',  locale: 'es-BO' },
  [CountryCode.BR]: { code: CountryCode.BR, name: 'Brasil',             currency: 'BRL', tax_rate: 0.17,  tax_label: 'ICMS',  phone_prefix: '+55',   locale: 'pt-BR' },
  [CountryCode.CL]: { code: CountryCode.CL, name: 'Chile',              currency: 'CLP', tax_rate: 0.19,  tax_label: 'IVA',   phone_prefix: '+56',   locale: 'es-CL' },
  [CountryCode.CO]: { code: CountryCode.CO, name: 'Colombia',           currency: 'COP', tax_rate: 0.19,  tax_label: 'IVA',   phone_prefix: '+57',   locale: 'es-CO' },
  [CountryCode.CR]: { code: CountryCode.CR, name: 'Costa Rica',         currency: 'CRC', tax_rate: 0.13,  tax_label: 'IVA',   phone_prefix: '+506',  locale: 'es-CR' },
  [CountryCode.CU]: { code: CountryCode.CU, name: 'Cuba',               currency: 'CUP', tax_rate: 0.10,  tax_label: 'IVA',   phone_prefix: '+53',   locale: 'es-CU' },
  [CountryCode.DO]: { code: CountryCode.DO, name: 'República Dominicana', currency: 'DOP', tax_rate: 0.18, tax_label: 'ITBIS', phone_prefix: '+1809', locale: 'es-DO' },
  [CountryCode.EC]: { code: CountryCode.EC, name: 'Ecuador',            currency: 'USD', tax_rate: 0.15,  tax_label: 'IVA',   phone_prefix: '+593',  locale: 'es-EC' },
  [CountryCode.ES]: { code: CountryCode.ES, name: 'España',             currency: 'EUR', tax_rate: 0.21,  tax_label: 'IVA',   phone_prefix: '+34',   locale: 'es-ES' },
  [CountryCode.GT]: { code: CountryCode.GT, name: 'Guatemala',          currency: 'GTQ', tax_rate: 0.12,  tax_label: 'IVA',   phone_prefix: '+502',  locale: 'es-GT' },
  [CountryCode.HN]: { code: CountryCode.HN, name: 'Honduras',           currency: 'HNL', tax_rate: 0.15,  tax_label: 'ISV',   phone_prefix: '+504',  locale: 'es-HN' },
  [CountryCode.MX]: { code: CountryCode.MX, name: 'México',             currency: 'MXN', tax_rate: 0.16,  tax_label: 'IVA',   phone_prefix: '+52',   locale: 'es-MX' },
  [CountryCode.NI]: { code: CountryCode.NI, name: 'Nicaragua',          currency: 'NIO', tax_rate: 0.15,  tax_label: 'IVA',   phone_prefix: '+505',  locale: 'es-NI' },
  [CountryCode.PA]: { code: CountryCode.PA, name: 'Panamá',             currency: 'PAB', tax_rate: 0.07,  tax_label: 'ITBMS', phone_prefix: '+507',  locale: 'es-PA' },
  [CountryCode.PE]: { code: CountryCode.PE, name: 'Perú',               currency: 'PEN', tax_rate: 0.18,  tax_label: 'IGV',   phone_prefix: '+51',   locale: 'es-PE' },
  [CountryCode.PR]: { code: CountryCode.PR, name: 'Puerto Rico',        currency: 'USD', tax_rate: 0.115, tax_label: 'IVU',   phone_prefix: '+1787', locale: 'es-PR' },
  [CountryCode.PY]: { code: CountryCode.PY, name: 'Paraguay',           currency: 'PYG', tax_rate: 0.10,  tax_label: 'IVA',   phone_prefix: '+595',  locale: 'es-PY' },
  [CountryCode.SV]: { code: CountryCode.SV, name: 'El Salvador',        currency: 'USD', tax_rate: 0.13,  tax_label: 'IVA',   phone_prefix: '+503',  locale: 'es-SV' },
  [CountryCode.UY]: { code: CountryCode.UY, name: 'Uruguay',            currency: 'UYU', tax_rate: 0.22,  tax_label: 'IVA',   phone_prefix: '+598',  locale: 'es-UY' },
  [CountryCode.VE]: { code: CountryCode.VE, name: 'Venezuela',          currency: 'VES', tax_rate: 0.16,  tax_label: 'IVA',   phone_prefix: '+58',   locale: 'es-VE' },
};

export function getCountrySettings(code: string | null | undefined): CountrySettings | null {
  if (!code) return null;
  return COUNTRY_SETTINGS[code.toUpperCase() as CountryCode] ?? null;
}

export function listCountries(): CountrySettings[] {
  return Object.values(COUNTRY_SETTINGS).sort((a, b) => a.name.localeCompare(b.name));
}
