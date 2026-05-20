import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import { Sale } from '../sales/entities/sale.entity';
import { Company } from '../companies/entities/company.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Quotation } from '../quotations/entities/quotation.entity';
import { Remission } from '../remissions/entities/remission.entity';

/**
 * Resuelve el logo de la empresa a un Buffer que PDFKit pueda embeber.
 * Soporta data URLs (base64) y URLs HTTP/HTTPS. Devuelve null si:
 *   - No hay logo
 *   - El formato no es PNG/JPEG (PDFKit no maneja SVG/WebP nativamente)
 *   - El fetch falla
 */
async function fetchLogoBuffer(
  url: string | null | undefined,
  logger?: Logger,
): Promise<Buffer | null> {
  if (!url) return null;
  try {
    // Data URL: data:image/png;base64,XXXX
    const dataMatch = url.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (dataMatch) {
      return Buffer.from(dataMatch[2], 'base64');
    }
    if (/^data:/i.test(url)) {
      // Otro formato (svg, webp) que pdfkit no soporta.
      return null;
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 5000,
        // Limitamos a 2 MB para no inflar memoria del proceso.
        maxContentLength: 2 * 1024 * 1024,
        maxBodyLength: 2 * 1024 * 1024,
      });
      const ct = String(res.headers['content-type'] ?? '').toLowerCase();
      if (!/png|jpeg|jpg/.test(ct)) return null;
      return Buffer.from(res.data);
    }
    return null;
  } catch (err) {
    logger?.warn(`fetchLogoBuffer failed for ${url}: ${(err as Error).message}`);
    return null;
  }
}

export interface EmploymentCertificateData {
  position?: string;
  start_date: string;
  end_date?: string;
  salary?: number;
  contract_type?: string;
  notes?: string;
  issued_in?: string;
}

const DEFAULT_PRIMARY = '#1E3A5F';
const DEFAULT_ACCENT = '#2563EB';
const LIGHT_GRAY = '#F8FAFC';
const MID_GRAY = '#94A3B8';
const DARK = '#1E293B';
const WHITE = '#FFFFFF';

// PRIMARY/ACCENT son mutables porque los seteamos al inicio de cada
// generador con la identidad visual de la empresa (HSL → hex). Como las
// llamadas a `this.draw*` son sincrónicas dentro de cada generador y Node
// es single-threaded, no hay riesgo de colisión entre PDFs concurrentes.
let PRIMARY = DEFAULT_PRIMARY;
let ACCENT = DEFAULT_ACCENT;
function applyBrand(company: Company | null | undefined) {
  const b = brandFor(company);
  PRIMARY = b.primary;
  ACCENT = b.accent;
}

// El servidor puede correr en cualquier zona horaria; forzamos Bogotá en los
// PDFs porque la empresa opera en Colombia y antes la hora salía corrida
// (el container vivía en UTC y el toLocaleDateString usaba esa).
const TZ = 'America/Bogota';
function fmtDate(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const dd = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dd.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  }).format(dd);
}
function fmtDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const dd = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dd.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  }).format(dd);
}

/**
 * Convierte el formato HSL que persistimos en `companies.primary_color`
 * ("358 74% 43%") al hex que PDFKit acepta. Si la cadena no tiene el formato
 * esperado, devolvemos el fallback.
 */
function hslStringToHex(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const trimmed = String(input).trim();
  // Permite también que el cliente guarde directamente "#RRGGBB".
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;

  const match = trimmed.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) return fallback;
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  if ([h, s, l].some(Number.isNaN)) return fallback;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hPrime >= 0 && hPrime < 1) { r1 = c; g1 = x; }
  else if (hPrime < 2) { r1 = x; g1 = c; }
  else if (hPrime < 3) { g1 = c; b1 = x; }
  else if (hPrime < 4) { g1 = x; b1 = c; }
  else if (hPrime < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  const to255 = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r1)}${to255(g1)}${to255(b1)}`;
}

function brandFor(company: Company | null | undefined) {
  return {
    primary: hslStringToHex(company?.primary_color, DEFAULT_PRIMARY),
    accent: hslStringToHex(company?.accent_color, DEFAULT_ACCENT),
  };
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Elimina páginas vacías que PDFKit pudo haber creado por overflow
   * accidental de `doc.text()`. PDFKit con `bufferPages: true` mantiene las
   * páginas en `doc._pageBuffer`. La "última página útil" es la que
   * contiene la posición actual del cursor (`doc.page`); cualquier página
   * posterior fue auto-creada por overflow y NO se usó.
   *
   * Llamar SIEMPRE antes de `drawFooter` — porque drawFooter usa
   * `switchToPage(i)` y "moverse" a una página fantasma haría que sobreviva.
   */
  private trimEmptyTrailingPages(doc: any) {
    const buf: any[] | undefined = doc._pageBuffer;
    if (!Array.isArray(buf) || buf.length <= 1) return;
    const lastUsefulIndex = buf.indexOf(doc.page);
    if (lastUsefulIndex < 0 || lastUsefulIndex >= buf.length - 1) return;
    const removed = buf.length - lastUsefulIndex - 1;
    doc._pageBuffer = buf.slice(0, lastUsefulIndex + 1);
    this.logger.warn(
      `PDF: ${removed} página(s) vacía(s) eliminada(s) tras overflow.`,
    );
  }

  // ─── Invoice ───────────────────────────────────────────────────────────────
  async generateInvoice(sale: Sale, company: Company): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4',  margins: {
    top: 30,
    bottom: 30,
    left: 30,
    right: 30,
  } });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawHeader(doc, company, logo);
      this.drawInvoiceMeta(doc, sale);
      this.drawCustomerBlock(doc, sale);
      this.drawItemsTable(doc, sale);
      this.drawTotals(doc, sale, company);
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);

      doc.end();
    });
  }

  // ─── Quotation ─────────────────────────────────────────────────────────────
  async generateQuotation(quotation: Quotation, company: Company): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawHeader(doc, company, logo);
      this.drawQuotationMeta(doc, quotation);
      this.drawQuotationCustomerBlock(doc, quotation);
      this.drawQuotationItemsTable(doc, quotation);
      this.drawQuotationTotals(doc, quotation, company);
      if (quotation.notes || quotation.terms) this.drawQuotationNotes(doc, quotation);
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);

      doc.end();
    });
  }

  // ─── Remission ─────────────────────────────────────────────────────────────
  async generateRemission(remission: Remission, company: Company): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawHeader(doc, company, logo);
      this.drawRemissionMeta(doc, remission);
      this.drawRemissionCustomerBlock(doc, remission);
      this.drawRemissionItemsTable(doc, remission);
      this.drawRemissionFooterNote(doc, remission);
      doc.flushPages();
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);

      doc.end();
    });
  }

  // ─── Inventory Report ──────────────────────────────────────────────────────
  async generateInventoryReport(data: any[], company: Company): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape'});
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawPageHeader(doc, company, 'Reporte de Inventario', logo);
      this.drawInventoryTable(doc, data);
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);

      doc.end();
    });
  }

  // ─── Employment Certificate ───────────────────────────────────────────────
  async generateEmploymentCertificate(
    customer: Customer,
    company: Company,
    data: EmploymentCertificateData,
  ): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 60 });
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawHeader(doc, company, logo);

      doc.y = 140;

      doc.fontSize(18).fillColor(DARK).font('Helvetica-Bold')
        .text('CERTIFICACIÓN LABORAL', 50, doc.y, { width: 495, align: 'center' });

      doc.moveDown(0.5);
      doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica')
        .text(
          `Expedido el ${new Date().toLocaleDateString('es-CO', {
            day: '2-digit', month: 'long', year: 'numeric',
          })}`,
          50, doc.y, { width: 495, align: 'center' },
        );

      doc.moveDown(2);

      const startDate = new Date(data.start_date);
      const startDateStr = startDate.toLocaleDateString('es-CO', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
      const endDateStr = data.end_date
        ? new Date(data.end_date).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'long', year: 'numeric',
          })
        : null;

      const salaryStr =
        data.salary !== undefined && data.salary !== null
          ? this.fmt(data.salary)
          : null;

      const docLabel = customer.document_type
        ? `${customer.document_type} ${customer.document_number ?? ''}`.trim()
        : (customer.document_number ?? '');

      doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold')
        .text('LA EMPRESA', 50, doc.y, { continued: true })
        .font('Helvetica').text(' que suscribe', { continued: false });

      doc.moveDown(1);
      doc.fontSize(11).font('Helvetica').text(
        'CERTIFICA QUE:',
        50, doc.y, { width: 495 },
      );

      doc.moveDown(1);
      const lines: string[] = [];
      lines.push(
        `El(la) señor(a) ${customer.name}${docLabel ? `, identificado(a) con ${docLabel}` : ''
        }, ${data.end_date ? 'laboró' : 'labora'} en ${company.name}` +
          `${data.position ? ` desempeñando el cargo de ${data.position}` : ''}` +
          `${data.contract_type ? `, mediante contrato ${data.contract_type}` : ''}.`,
      );
      lines.push(
        `Su vínculo laboral inició el ${startDateStr}` +
          `${endDateStr ? ` y finalizó el ${endDateStr}` : ' y se encuentra vigente a la fecha'}.`,
      );
      if (salaryStr) {
        lines.push(
          `Devenga${data.end_date ? 'ba' : ''} un salario mensual de ${salaryStr}.`,
        );
      }
      if (data.notes) {
        lines.push(data.notes);
      }

      doc.fontSize(11).font('Helvetica').fillColor(DARK);
      for (const line of lines) {
        doc.text(line, 50, doc.y, { width: 495, align: 'justify' });
        doc.moveDown(0.8);
      }

      doc.moveDown(1);
      const issuedIn = data.issued_in ?? company.address ?? '';
      const cityLine = issuedIn
        ? `La presente certificación se expide en ${issuedIn} a solicitud del(la) interesado(a).`
        : 'La presente certificación se expide a solicitud del(la) interesado(a).';
      doc.text(cityLine, 50, doc.y, { width: 495, align: 'justify' });

      const signatureY = Math.max(doc.y + 80, doc.page.height - 180);
      doc.moveTo(170, signatureY).lineTo(425, signatureY).stroke('#94A3B8');
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
        .text(company.name, 170, signatureY + 6, { width: 255, align: 'center' });
      doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica')
        .text('Representante legal / Talento humano', 170, signatureY + 20, {
          width: 255, align: 'center',
        });
      if (company.tax_id) {
        doc.text(`NIT/ID: ${company.tax_id}`, 170, signatureY + 32, {
          width: 255, align: 'center',
        });
      }
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);
      doc.end();
    });
  }

  // ─── Sales Report ──────────────────────────────────────────────────────────
  async generateSalesReport(data: any[], company: Company, from: string, to: string): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 50});
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      this.drawPageHeader(doc, company, 'Reporte de Ventas', logo);

      // Period
      doc.fontSize(10).fillColor(MID_GRAY).font('Helvetica')
        .text(`Período: ${fmtDate(from)} — ${fmtDate(to)}`, 50, doc.y + 10);

      doc.moveDown(1);
      this.drawSalesReportTable(doc, data, company);
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);

      doc.end();
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────
  private drawHeader(doc: any, company: Company, logo?: Buffer | null) {
    // Background bar
    doc.rect(0, 0, 595, 100).fill(PRIMARY);

    // Logo (si la empresa lo subió). Lo dibujamos en un cuadrado de 64x64 a la
    // izquierda y desplazamos el texto a la derecha para que no se traslapen.
    let textX = 50;
    if (logo) {
      try {
        doc.image(logo, 50, 22, { fit: [56, 56] });
        textX = 120;
      } catch {
        // Formato no soportado por pdfkit; seguimos sin logo.
      }
    }

    // Company name. `lineBreak: false` + ellipsis evita el salto de línea
    // cuando el nombre es largo (reportaban "se desborda y baja a dos líneas").
    // Auto-ajustamos el tamaño de fuente cuando el nombre no cabe a 22pt.
    const nameText = company.display_name || company.name || '';
    const maxNameWidth = 270;
    let nameFontSize = 22;
    doc.font('Helvetica-Bold');
    while (
      nameFontSize > 12 &&
      doc.fontSize(nameFontSize).widthOfString(nameText) > maxNameWidth
    ) {
      nameFontSize -= 1;
    }
    doc.fontSize(nameFontSize).fillColor(WHITE)
      .text(nameText, textX, 25, {
        width: maxNameWidth,
        ellipsis: true,
        lineBreak: false,
      });

    // Texto en blanco para contraste fuerte sobre el header oscuro — antes
    // estaba en '#A0B4CC' (azul-gris claro) y se veía apagado contra el
    // PRIMARY navy. Negro puro no funciona acá porque el fondo es oscuro.
    doc.fontSize(9).fillColor(WHITE).font('Helvetica');
    if (company.address)
      doc.text(company.address, textX, 55, {
        width: 250, ellipsis: true, lineBreak: false,
      });
    if (company.email)
      doc.text(company.email, textX, 68, {
        width: 250, ellipsis: true, lineBreak: false,
      });
    if (company.phone)
      doc.text(company.phone, textX, 81, {
        width: 250, ellipsis: true, lineBreak: false,
      });

    // Tax id badge
    if (company.tax_id) {
      doc.fontSize(9).fillColor(WHITE)
        .text(`NIT / ID: ${company.tax_id}`, 400, 68, {
          align: 'right', width: 145, ellipsis: true, lineBreak: false,
        });
    }

    doc.moveDown(0);
    doc.y = 115;
  }

  private drawPageHeader(doc: any, company: Company, title: string, logo?: Buffer | null) {
    doc.rect(0, 0, doc.page.width, 70).fill(PRIMARY);

    let textX = 40;
    if (logo) {
      try {
        doc.image(logo, 40, 12, { fit: [46, 46] });
        textX = 100;
      } catch { /* ignore unsupported logo */ }
    }
    // Mismo criterio anti-overflow que drawHeader: ellipsis + autoshrink
    // para que el nombre no se desborde a dos líneas y empuje el título.
    const nameText = company.display_name || company.name || '';
    const maxNameWidth = doc.page.width - textX - 150;
    let nameFontSize = 18;
    doc.font('Helvetica-Bold');
    while (
      nameFontSize > 11 &&
      doc.fontSize(nameFontSize).widthOfString(nameText) > maxNameWidth
    ) {
      nameFontSize -= 1;
    }
    doc.fontSize(nameFontSize).fillColor(WHITE)
      .text(nameText, textX, 15, {
        width: maxNameWidth, ellipsis: true, lineBreak: false,
      });
    doc.fontSize(12).fillColor(WHITE).font('Helvetica')
      .text(title, textX, 42, {
        width: maxNameWidth, ellipsis: true, lineBreak: false,
      });
    doc.fontSize(9).fillColor(WHITE)
      .text(fmtDate(new Date()), doc.page.width - 130, 42, {
        width: 100, lineBreak: false,
      });
    doc.y = 90;
  }

  private drawInvoiceMeta(doc: any, sale: Sale) {
    // Right badge
    doc.rect(395, 115, 150, 70).fill(ACCENT).roundedRect(395, 115, 150, 70, 6).fill(ACCENT);
    doc.fontSize(10).fillColor(WHITE).font('Helvetica').text('FACTURA', 395, 122, { width: 150, align: 'center' });
    doc.fontSize(14).fillColor(WHITE).font('Helvetica-Bold')
      .text(sale.invoice_number, 395, 138, { width: 150, align: 'center' });
    doc.fontSize(9).fillColor('#BFDBFE').font('Helvetica')
      .text(fmtDate(sale.created_at), 395, 162, { width: 150, align: 'center' });

    // Type badge
    const typeBadge = sale.type === 'CREDIT' ? 'CRÉDITO' : 'CONTADO';
    const badgeColor = sale.type === 'CREDIT' ? '#DC2626' : '#16A34A';
    doc.roundedRect(395, 192, 150, 22, 4).fill(badgeColor);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
      .text(typeBadge, 395, 198, { width: 150, align: 'center' });

    doc.y = 115;
  }

  private drawCustomerBlock(doc: any, sale: Sale) {
    const y = doc.y + 5;
    // 5pt extra de separación del borde fisico para evitar que los visores/
    // impresoras recorten el inicio del bloque (reporte de "desbordamiento
    // a la izquierda" en portrait).
    const blockW = 315;
    const textW = blockW - 24;
    doc.rect(55, y, blockW, 80).fill(LIGHT_GRAY).stroke('#E2E8F0');
    doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica-Bold')
      .text('FACTURAR A', 67, y + 10, { width: textW });
    doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold')
      .text(sale.customer?.name || '', 67, y + 24, { width: textW, ellipsis: true, lineBreak: false });
    doc.fontSize(9).fillColor(DARK).font('Helvetica');
    if (sale.customer?.document_number)
      doc.text(`ID: ${sale.customer.document_number}`, 67, y + 42, { width: textW, ellipsis: true, lineBreak: false });
    if (sale.customer?.email)
      doc.text(sale.customer.email, 67, y + 54, { width: textW, ellipsis: true, lineBreak: false });
    if (sale.customer?.phone)
      doc.text(sale.customer.phone, 67, y + 66, { width: textW, ellipsis: true, lineBreak: false });

    doc.y = y + 95;
  }

  private drawItemsTable(doc: any, sale: Sale) {
    const startY = doc.y;
    // A4 portrait usable: 55..545 (490pt). Movimos el borde izquierdo de 50
    // a 55 para evitar el desbordamiento que el usuario reportaba en
    // viewers que recortan el borde físico del papel.
    // desc=195 | qty=45 | price=85 | disc=55 | sub=110 = 490
    const cols = { desc: 55, qty: 250, price: 295, disc: 380, sub: 435 };
    const widths = { desc: 195, qty: 45, price: 85, disc: 55, sub: 110 };

    doc.rect(55, startY, 490, 24).fill(PRIMARY);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold');
    doc.text('PRODUCTO', cols.desc + 5, startY + 7, { width: widths.desc - 5 });
    doc.text('CANT.', cols.qty, startY + 7, { width: widths.qty, align: 'center' });
    doc.text('P. UNIT.', cols.price, startY + 7, { width: widths.price, align: 'right' });
    doc.text('DESC.', cols.disc, startY + 7, { width: widths.disc, align: 'right' });
    doc.text('SUBTOTAL', cols.sub, startY + 7, { width: widths.sub, align: 'right' });

    let rowY = startY + 24;
    doc.font('Helvetica').fontSize(9);

    for (let i = 0; i < (sale.items || []).length; i++) {
      const item = sale.items[i];
      const bg = i % 2 === 0 ? WHITE : LIGHT_GRAY;
      doc.rect(55, rowY, 490, 22).fill(bg);
      doc.fillColor(DARK);
      doc.text(item.product_name || '', cols.desc + 5, rowY + 6, {
        width: widths.desc - 5, ellipsis: true, lineBreak: false,
      });
      doc.text(String(item.quantity), cols.qty, rowY + 6, { width: widths.qty, align: 'center', lineBreak: false });
      doc.text(this.fmt(item.unit_price), cols.price, rowY + 6, { width: widths.price, align: 'right', lineBreak: false });
      doc.text(this.fmt(item.discount || 0), cols.disc, rowY + 6, { width: widths.disc, align: 'right', lineBreak: false });
      doc.text(this.fmt(item.subtotal), cols.sub, rowY + 6, { width: widths.sub, align: 'right', lineBreak: false });
      rowY += 22;
    }

    doc.rect(55, startY, 490, rowY - startY).stroke('#E2E8F0');
    doc.y = rowY + 10;
  }

  private drawTotals(doc: any, sale: Sale, company: Company) {
    const taxPct = Math.round(Number(company.tax_rate) * 100);
    // Keep totals block flush to the right margin (545pt).
    const labelW = 110;
    const valueW = 100;
    const rightX = 545 - valueW - labelW - 10; // 325

    const rows = [
      ['Subtotal', this.fmt(sale.subtotal)],
      [`Descuento`, `- ${this.fmt(sale.discount || 0)}`],
      [`IVA (${taxPct}%)`, this.fmt(sale.tax_amount)],
    ];

    let y = doc.y;
    doc.fontSize(9).font('Helvetica');

    for (const [label, value] of rows) {
      doc.fillColor(MID_GRAY).text(label, rightX, y, { width: labelW, align: 'right' });
      doc.fillColor(DARK).text(value, rightX + labelW + 10, y, { width: valueW, align: 'right' });
      y += 18;
    }

    const boxX = rightX - 5;
    const boxW = 545 - boxX;
    doc.roundedRect(boxX, y, boxW, 28, 4).fill(PRIMARY);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE)
      .text('TOTAL', rightX, y + 7, { width: labelW, align: 'right' });
    doc.text(this.fmt(sale.total), rightX + labelW + 10, y + 7, { width: valueW, align: 'right' });

    if (sale.due_date) {
      doc.y = y + 40;
      doc.fontSize(9).fillColor('#DC2626').font('Helvetica-Bold')
        .text(`Fecha límite de pago: ${fmtDate(sale.due_date)}`, 50, doc.y);
    }

    doc.y = y + 45;
  }

  private drawQuotationMeta(doc: any, quotation: Quotation) {
    // En el PDF impreso/exportado el estado "DRAFT" se muestra como
    // "EMITIDA" en verde — el documento que llega al cliente no debe verse
    // como un borrador interno. El estado real sigue siendo DRAFT en DB.
    const STATUS_COLORS: Record<string, string> = {
      DRAFT: '#16A34A',
      SENT: '#2563EB',
      ACCEPTED: '#16A34A',
      REJECTED: '#DC2626',
      EXPIRED: '#D97706',
    };
    const STATUS_LABELS: Record<string, string> = {
      DRAFT: 'EMITIDA',
      SENT: 'ENVIADA',
      ACCEPTED: 'ACEPTADA',
      REJECTED: 'RECHAZADA',
      EXPIRED: 'EXPIRADA',
    };

    doc.roundedRect(395, 115, 150, 70, 6).fill(ACCENT);
    doc.fontSize(10).fillColor(WHITE).font('Helvetica').text('COTIZACIÓN', 395, 122, { width: 150, align: 'center' });
    doc.fontSize(14).fillColor(WHITE).font('Helvetica-Bold')
      .text(quotation.quotation_number, 395, 138, { width: 150, align: 'center' });
    doc.fontSize(9).fillColor('#BFDBFE').font('Helvetica')
      .text(fmtDate(quotation.created_at), 395, 162, { width: 150, align: 'center' });

    const statusColor = STATUS_COLORS[quotation.status] || '#64748B';
    const statusLabel = STATUS_LABELS[quotation.status] || quotation.status;
    doc.roundedRect(395, 192, 150, 22, 4).fill(statusColor);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
      .text(statusLabel, 395, 198, { width: 150, align: 'center' });

    if (quotation.valid_until) {
      doc.roundedRect(395, 220, 150, 22, 4).fill(LIGHT_GRAY);
      doc.fontSize(8).fillColor(DARK).font('Helvetica')
        .text(`Válida hasta: ${fmtDate(quotation.valid_until)}`, 395, 226, { width: 150, align: 'center' });
    }

    doc.y = 115;
  }

  private drawQuotationCustomerBlock(doc: any, quotation: Quotation) {
    const y = doc.y + 5;
    doc.rect(55, y, 315, 80).fill(LIGHT_GRAY).stroke('#E2E8F0');
    doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica-Bold').text('COTIZAR A', 67, y + 10);
    doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold').text(quotation.customer?.name || '', 67, y + 24);
    doc.fontSize(9).fillColor(DARK).font('Helvetica');
    // lineBreak:false + ellipsis para que clientes con email/tel largos no
    // arrastren el cursor a una segunda página por wrap.
    if (quotation.customer?.document_number)
      doc.text(`ID: ${quotation.customer.document_number}`, 67, y + 42, {
        width: 280, ellipsis: true, lineBreak: false,
      });
    if (quotation.customer?.email)
      doc.text(quotation.customer.email, 67, y + 54, {
        width: 280, ellipsis: true, lineBreak: false,
      });
    if (quotation.customer?.phone)
      doc.text(quotation.customer.phone, 67, y + 66, {
        width: 280, ellipsis: true, lineBreak: false,
      });
    doc.y = y + 95;
  }

  private drawQuotationItemsTable(doc: any, quotation: Quotation) {
    const startY = doc.y;
    // Movido a x=55 (antes 50) por desbordamiento reportado en visores que
    // recortan el borde físico. Sum widths: 170+40+40+85+50+105 = 490.
    const cols = { desc: 55, unit: 225, qty: 265, price: 305, disc: 390, sub: 440 };
    const widths = { desc: 170, unit: 40, qty: 40, price: 85, disc: 50, sub: 105 };

    doc.rect(55, startY, 490, 24).fill(PRIMARY);
    doc.fontSize(8.5).fillColor(WHITE).font('Helvetica-Bold');
    doc.text('DESCRIPCIÓN / SERVICIO', cols.desc + 5, startY + 7, { width: widths.desc - 5 });
    doc.text('UNIDAD', cols.unit, startY + 7, { width: widths.unit, align: 'center' });
    doc.text('CANT.', cols.qty, startY + 7, { width: widths.qty, align: 'center' });
    doc.text('P. UNIT.', cols.price, startY + 7, { width: widths.price, align: 'right' });
    doc.text('DESC.', cols.disc, startY + 7, { width: widths.disc, align: 'right' });
    doc.text('SUBTOTAL', cols.sub, startY + 7, { width: widths.sub, align: 'right' });

    let rowY = startY + 24;
    doc.font('Helvetica').fontSize(8.5);

    for (let i = 0; i < (quotation.items || []).length; i++) {
      const item = quotation.items[i];
      const bg = i % 2 === 0 ? WHITE : LIGHT_GRAY;
      const rowH = 22;
      doc.rect(55, rowY, 490, rowH).fill(bg);
      doc.fillColor(DARK);
      doc.text(item.description || '', cols.desc + 5, rowY + 6, {
        width: widths.desc - 5, ellipsis: true, lineBreak: false,
      });
      doc.text(item.unit || '-', cols.unit, rowY + 6, { width: widths.unit, align: 'center', lineBreak: false });
      doc.text(String(item.quantity), cols.qty, rowY + 6, { width: widths.qty, align: 'center', lineBreak: false });
      doc.text(this.fmt(item.unit_price), cols.price, rowY + 6, { width: widths.price, align: 'right', lineBreak: false });
      doc.text(this.fmt(item.discount || 0), cols.disc, rowY + 6, { width: widths.disc, align: 'right', lineBreak: false });
      doc.text(this.fmt(item.subtotal), cols.sub, rowY + 6, { width: widths.sub, align: 'right', lineBreak: false });
      rowY += rowH;
    }

    doc.rect(55, startY, 490, rowY - startY).stroke('#E2E8F0');
    doc.y = rowY + 10;
  }

  private drawQuotationTotals(doc: any, quotation: Quotation, company: Company) {
    const taxPct = Math.round(Number(company.tax_rate) * 100);
    const labelW = 110;
    const valueW = 100;
    const rightX = 545 - valueW - labelW - 10;

    const rows = [
      ['Subtotal', this.fmt(quotation.subtotal)],
      ['Descuento', `- ${this.fmt(quotation.discount || 0)}`],
      [`IVA (${taxPct}%)`, this.fmt(quotation.tax_amount)],
    ];

    let y = doc.y;
    doc.fontSize(9).font('Helvetica');

    for (const [label, value] of rows) {
      doc.fillColor(MID_GRAY).text(label, rightX, y, { width: labelW, align: 'right' });
      doc.fillColor(DARK).text(value, rightX + labelW + 10, y, { width: valueW, align: 'right' });
      y += 18;
    }

    const boxX = rightX - 5;
    const boxW = 545 - boxX;
    doc.roundedRect(boxX, y, boxW, 28, 4).fill(PRIMARY);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(WHITE)
      .text('TOTAL', rightX, y + 7, { width: labelW, align: 'right' });
    doc.text(this.fmt(quotation.total), rightX + labelW + 10, y + 7, { width: valueW, align: 'right' });

    doc.y = y + 42;
  }

  private drawQuotationNotes(doc: any, quotation: Quotation) {
    let y = doc.y + 10;

    if (quotation.notes) {
      doc.rect(50, y, 495, 14).fill(PRIMARY);
      doc.fontSize(8.5).fillColor(WHITE).font('Helvetica-Bold').text('OBSERVACIONES', 56, y + 3);
      y += 14;
      doc.rect(50, y, 495, 1).fill('#E2E8F0');
      doc.fontSize(9).fillColor(DARK).font('Helvetica').text(quotation.notes, 56, y + 8, { width: 480 });
      y += doc.heightOfString(quotation.notes, { width: 480 }) + 16;
    }

    if (quotation.terms) {
      doc.rect(50, y, 495, 14).fill('#64748B');
      doc.fontSize(8.5).fillColor(WHITE).font('Helvetica-Bold').text('TÉRMINOS Y CONDICIONES', 56, y + 3);
      y += 14;
      doc.fontSize(9).fillColor(DARK).font('Helvetica').text(quotation.terms, 56, y + 8, { width: 480 });
    }

    doc.y = y + 20;
  }

  private drawInventoryTable(doc: any, data: any[]) {
    const startY = doc.y + 10;
    const headers = ['Producto', 'SKU', 'Categoría', 'Stock', 'Mín.', 'Precio', 'Costo', 'Valor Stock', 'Estado'];
    const widths = [160, 70, 90, 50, 40, 65, 65, 80, 60];
    const W = doc.page.width - 80;

    let x = 40;
    doc.rect(40, startY, W, 22).fill(PRIMARY);
    doc.fontSize(7.5).fillColor(WHITE).font('Helvetica-Bold');
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 3, startY + 6, { width: widths[i], align: i >= 3 ? 'right' : 'left' });
      x += widths[i];
    }

    let rowY = startY + 22;
    for (let r = 0; r < data.length; r++) {
      const d = data[r];
      const isLow = d.is_low_stock;
      doc.rect(40, rowY, W, 18).fill(isLow ? '#FEF2F2' : r % 2 === 0 ? WHITE : LIGHT_GRAY);
      doc.fontSize(7.5).fillColor(isLow ? '#DC2626' : DARK).font('Helvetica');
      let cx = 40;
      const vals = [d.name, d.sku, d.category || '-', d.stock, d.min_stock, this.fmt(d.price), this.fmt(d.cost), this.fmt(d.stock_value), isLow ? '⚠ Bajo' : '✓ OK'];
      for (let i = 0; i < vals.length; i++) {
        doc.text(String(vals[i]), cx + 3, rowY + 4, { width: widths[i], align: i >= 3 ? 'right' : 'left' });
        cx += widths[i];
      }
      rowY += 18;
      if (rowY > doc.page.height - 60) { doc.addPage(); rowY = 60; }
    }
    doc.rect(40, startY, W, rowY - startY).stroke('#E2E8F0');
  }

  private drawSalesReportTable(doc: any, data: any[], company: Company) {
    const startY = doc.y;
    const headers = ['Período', 'N° Ventas', 'Ingresos', 'Impuestos', 'Descuentos'];
    // 495 budget: 105 + 70 + 110 + 110 + 100
    const widths = [105, 70, 110, 110, 100];
    let x = 50;

    doc.rect(50, startY, 495, 22).fill(PRIMARY);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold');
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 4, startY + 6, { width: widths[i], align: i === 0 ? 'left' : 'right' });
      x += widths[i];
    }

    let rowY = startY + 22;
    let totalRev = 0, totalTax = 0, totalDisc = 0, totalSales = 0;

    for (let r = 0; r < data.length; r++) {
      const d = data[r];
      totalRev += Number(d.revenue); totalTax += Number(d.taxes);
      totalDisc += Number(d.discounts); totalSales += Number(d.total_sales);
      doc.rect(50, rowY, 495, 20).fill(r % 2 === 0 ? WHITE : LIGHT_GRAY);
      doc.fontSize(9).fillColor(DARK).font('Helvetica');
      let cx = 50;
      const vals = [d.period, d.total_sales, this.fmt(d.revenue), this.fmt(d.taxes), this.fmt(d.discounts)];
      for (let i = 0; i < vals.length; i++) {
        doc.text(String(vals[i]), cx + 4, rowY + 5, { width: widths[i], align: i === 0 ? 'left' : 'right' });
        cx += widths[i];
      }
      rowY += 20;
    }

    // Totals row
    doc.rect(50, rowY, 495, 22).fill(ACCENT);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold');
    let cx = 50;
    const totals = ['TOTAL', totalSales, this.fmt(totalRev), this.fmt(totalTax), this.fmt(totalDisc)];
    for (let i = 0; i < totals.length; i++) {
      doc.text(String(totals[i]), cx + 4, rowY + 6, { width: widths[i], align: i === 0 ? 'left' : 'right' });
      cx += widths[i];
    }
    doc.rect(50, startY, 495, rowY + 22 - startY).stroke('#E2E8F0');
  }

  // ─── Remission helpers ─────────────────────────────────────────────────────
  private drawRemissionMeta(doc: any, remission: Remission) {
    // Mismo criterio que cotizaciones: el PDF que se descarga/envía nunca
    // debe verse como "borrador" para el cliente final.
    const STATUS_COLORS: Record<string, string> = {
      DRAFT: '#16A34A',
      ISSUED: '#16A34A',
      CANCELED: '#DC2626',
    };
    const STATUS_LABELS: Record<string, string> = {
      DRAFT: 'EMITIDA',
      ISSUED: 'EMITIDA',
      CANCELED: 'CANCELADA',
    };

    doc.roundedRect(395, 115, 150, 70, 6).fill(ACCENT);
    doc.fontSize(10).fillColor(WHITE).font('Helvetica')
      .text('REMISIÓN', 395, 122, { width: 150, align: 'center' });
    doc.fontSize(14).fillColor(WHITE).font('Helvetica-Bold')
      .text(remission.remission_number, 395, 138, { width: 150, align: 'center' });
    doc.fontSize(9).fillColor('#BFDBFE').font('Helvetica')
      .text(fmtDate(remission.created_at), 395, 162, { width: 150, align: 'center' });

    const statusColor = STATUS_COLORS[remission.status] || '#64748B';
    const statusLabel = STATUS_LABELS[remission.status] || remission.status;
    doc.roundedRect(395, 192, 150, 22, 4).fill(statusColor);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
      .text(statusLabel, 395, 198, { width: 150, align: 'center' });

    if (remission.warehouse?.name) {
      doc.roundedRect(395, 220, 150, 22, 4).fill(LIGHT_GRAY);
      doc.fontSize(8).fillColor(DARK).font('Helvetica')
        .text(`Bodega: ${remission.warehouse.name}`, 395, 226, { width: 150, align: 'center' });
    }

    doc.y = 115;
  }

  private drawRemissionCustomerBlock(doc: any, remission: Remission) {
    const y = doc.y + 5;
    doc.rect(55, y, 315, 80).fill(LIGHT_GRAY).stroke('#E2E8F0');
    const textW = 315 - 24;
    doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica-Bold')
      .text('ENTREGAR A', 67, y + 10, { width: textW });
    doc.fontSize(12).fillColor(DARK).font('Helvetica-Bold')
      .text(remission.customer?.name || '', 67, y + 24, { width: textW, ellipsis: true, lineBreak: false });
    doc.fontSize(9).fillColor(DARK).font('Helvetica');
    if (remission.customer?.document_number)
      doc.text(`ID: ${remission.customer.document_number}`, 67, y + 42, { width: textW, ellipsis: true, lineBreak: false });
    if (remission.customer?.address)
      doc.text(remission.customer.address, 67, y + 54, { width: textW, ellipsis: true, lineBreak: false });
    if (remission.customer?.phone)
      doc.text(remission.customer.phone, 67, y + 66, { width: textW, ellipsis: true, lineBreak: false });

    doc.y = y + 95;
  }

  private drawRemissionItemsTable(doc: any, remission: Remission) {
    const startY = doc.y;
    const showPrices = (remission.items || []).some((i) => Number(i.unit_price) > 0);
    // Width budget 490 (antes 495). Movido x de 50 a 55 por desbordamiento
    // izquierdo reportado.
    // Con precios: desc=205 | unit=45 | qty=45 | price=85 | sub=110 = 490
    // Sin precios: desc=340 | unit=70 | qty=80 = 490
    const cols = showPrices
      ? { desc: 55, unit: 260, qty: 305, price: 350, sub: 435 }
      : { desc: 55, unit: 395, qty: 465, price: 0, sub: 0 };
    const widths = showPrices
      ? { desc: 205, unit: 45, qty: 45, price: 85, sub: 110 }
      : { desc: 340, unit: 70, qty: 80, price: 0, sub: 0 };

    doc.rect(55, startY, 490, 24).fill(PRIMARY);
    doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold');
    doc.text('PRODUCTO / DESCRIPCIÓN', cols.desc + 5, startY + 7, { width: widths.desc - 5 });
    doc.text('UNIDAD', cols.unit, startY + 7, { width: widths.unit, align: 'center' });
    doc.text('CANT.', cols.qty, startY + 7, { width: widths.qty, align: 'center' });
    if (showPrices) {
      doc.text('P. UNIT.', cols.price, startY + 7, { width: widths.price, align: 'right' });
      doc.text('SUBTOTAL', cols.sub, startY + 7, { width: widths.sub, align: 'right' });
    }

    let rowY = startY + 24;
    doc.font('Helvetica').fontSize(9);

    for (let i = 0; i < (remission.items || []).length; i++) {
      const item = remission.items[i];
      const bg = i % 2 === 0 ? WHITE : LIGHT_GRAY;
      doc.rect(55, rowY, 490, 22).fill(bg);
      doc.fillColor(DARK);
      const label = item.description
        ? `${item.product_name} — ${item.description}`
        : item.product_name;
      doc.text(label, cols.desc + 5, rowY + 6, { width: widths.desc - 5, ellipsis: true, lineBreak: false });
      doc.text(item.unit || '-', cols.unit, rowY + 6, { width: widths.unit, align: 'center', lineBreak: false });
      doc.text(String(item.quantity), cols.qty, rowY + 6, { width: widths.qty, align: 'center', lineBreak: false });
      if (showPrices) {
        doc.text(this.fmt(item.unit_price), cols.price, rowY + 6, { width: widths.price, align: 'right', lineBreak: false });
        doc.text(this.fmt(Number(item.unit_price) * item.quantity), cols.sub, rowY + 6, { width: widths.sub, align: 'right', lineBreak: false });
      }
      rowY += 22;
    }

    doc.rect(55, startY, 490, rowY - startY).stroke('#E2E8F0');
    doc.y = rowY + 10;
  }

  private drawRemissionFooterNote(doc: any, remission: Remission) {
    if (remission.description) {
      doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica-Bold').text('OBSERVACIONES', 55, doc.y + 10);
      doc.fontSize(9).fillColor(DARK).font('Helvetica').text(remission.description, 55, doc.y + 4, { width: 490 });
    }

    // Bloque de firmas (estándar en remisiones)
    const sigY = doc.page.height - 140;
    doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica');
    doc.moveTo(70, sigY).lineTo(260, sigY).stroke('#94A3B8');
    doc.text('Entregó', 70, sigY + 6, { width: 190, align: 'center' });
    doc.moveTo(335, sigY).lineTo(525, sigY).stroke('#94A3B8');
    doc.text('Recibió (firma y aclaración)', 335, sigY + 6, { width: 190, align: 'center' });
  }

  private drawFooter(doc: any) {
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);

    const footerY = doc.page.height - 30;

    doc.fontSize(8)
      .fillColor(MID_GRAY)
      .font('Helvetica')
      .text(
        `Generado el ${fmtDateTime(new Date())} — Página ${i + 1} de ${range.count}`,
        50,
        footerY,
        {
          width: doc.page.width - 100,
          align: 'center',
          lineBreak: false,
        },
      );
  }
}

  private fmt(value: number | string): string {
    const n = Number(value) || 0;
    return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
  }

  // ─── Daily Plan (planeador del día) ────────────────────────────────────────
  /**
   * PDF del plan del día con:
   *   - checkboxes para marcar cada tarea como cumplida
   *   - lista de visitas con espacio para firma de "recibido" por cada una
   */
  async generateDailyPlan(plan: any, company: Company): Promise<Buffer> {
    const logo = await fetchLogoBuffer(company?.logo_url, this.logger);
    return new Promise((resolve, reject) => {
      applyBrand(company);
      const doc = new PDFDocument({ size: 'A4', margin: 50});
      const buffers: Buffer[] = [];
      doc.on('data', (c) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const dateLabel = new Date(plan.plan_date).toLocaleDateString('es-CO', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      });
      this.drawPageHeader(doc, company, `Planeador del día — ${dateLabel}`, logo);

      const userLine = plan.user?.name
        ? `Responsable: ${plan.user.name}`
        : '';
      doc.fontSize(10).fillColor(DARK).font('Helvetica');
      if (userLine) doc.text(userLine, 50, doc.y);
      if (plan.notes) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor(MID_GRAY).text('Notas del día:', 50, doc.y);
        doc.fontSize(10).fillColor(DARK).text(plan.notes, 50, doc.y + 2, { width: 495 });
      }
      doc.moveDown(1);

      // ── TAREAS ──────────────────────────────────────────────────────────
      const tasks = (plan.tasks ?? []).slice().sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      );
      if (tasks.length) {
        doc.fontSize(12).fillColor(PRIMARY).font('Helvetica-Bold').text('Tareas pendientes', 50, doc.y);
        doc.moveDown(0.4);
        for (const t of tasks) {
          if (doc.y > doc.page.height - 100) doc.addPage();
          const y = doc.y;
          // checkbox
          const checked = !!t.is_done;
          doc.rect(50, y + 2, 12, 12).lineWidth(1).stroke(checked ? PRIMARY : '#94A3B8');
          if (checked) {
            doc.moveTo(52, y + 8).lineTo(56, y + 12).lineTo(60, y + 4)
              .lineWidth(1.4).stroke(PRIMARY);
          }
          doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold')
            .text(t.title ?? '', 70, y, { width: 475 });
          if (t.description) {
            doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica')
              .text(t.description, 70, doc.y, { width: 475 });
          }
          if (t.priority) {
            doc.fontSize(8).fillColor(MID_GRAY).font('Helvetica')
              .text(`Prioridad: ${t.priority}`, 70, doc.y);
          }
          doc.moveDown(0.6);
        }
        doc.moveDown(0.6);
      }

      // ── VISITAS ─────────────────────────────────────────────────────────
      const visits = (plan.visits ?? []).slice().sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
      );
      if (visits.length) {
        if (doc.y > doc.page.height - 200) doc.addPage();
        doc.fontSize(12).fillColor(PRIMARY).font('Helvetica-Bold')
          .text('Visitas programadas', 50, doc.y);
        doc.moveDown(0.4);

        for (const v of visits) {
          // Cada visita pide ~110pt: nombre + hora + dirección + notas + firma.
          if (doc.y > doc.page.height - 130) doc.addPage();
          const blockTop = doc.y;

          // Caja de visita
          doc.rect(50, blockTop, 495, 110).lineWidth(0.5).stroke('#E2E8F0');

          // Header (nombre + hora + status)
          doc.fontSize(11).fillColor(DARK).font('Helvetica-Bold')
            .text(v.customer_name || v.customer?.name || 'Visita', 60, blockTop + 8, { width: 320 });
          if (v.scheduled_time) {
            doc.fontSize(10).fillColor(PRIMARY).font('Helvetica-Bold')
              .text(`Hora: ${v.scheduled_time}`, 380, blockTop + 8, { width: 160, align: 'right' });
          }
          // Dirección
          if (v.address) {
            doc.fontSize(9).fillColor(MID_GRAY).font('Helvetica')
              .text(v.address, 60, blockTop + 26, { width: 480 });
          }
          // Notas
          if (v.notes) {
            doc.fontSize(9).fillColor(DARK).font('Helvetica')
              .text(v.notes, 60, blockTop + 42, { width: 480 });
          }

          // Checkbox visita cumplida
          const checkY = blockTop + 70;
          doc.rect(60, checkY, 12, 12).lineWidth(1).stroke('#94A3B8');
          if (v.status === 'VISITED') {
            doc.moveTo(62, checkY + 6).lineTo(66, checkY + 10).lineTo(70, checkY + 2)
              .lineWidth(1.4).stroke(PRIMARY);
          }
          doc.fontSize(9).fillColor(DARK).font('Helvetica')
            .text('Visita cumplida', 80, checkY + 1);

          // Línea de firma
          const sigY = blockTop + 95;
          doc.moveTo(300, sigY).lineTo(530, sigY).stroke('#94A3B8');
          doc.fontSize(8).fillColor(MID_GRAY).font('Helvetica')
            .text('Firma de recibido', 300, sigY + 2, { width: 230, align: 'center' });

          doc.y = blockTop + 120;
        }
      }

      if (!tasks.length && !visits.length) {
        doc.fontSize(11).fillColor(MID_GRAY).font('Helvetica-Oblique')
          .text('Este día no tiene tareas ni visitas registradas.', 50, doc.y + 20);
      }
      this.trimEmptyTrailingPages(doc);
      this.drawFooter(doc);
      doc.end();
    });
  }
}
