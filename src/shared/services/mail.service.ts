import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('SMTP_HOST'),
      port: configService.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: configService.get('SMTP_USER'),
        pass: configService.get('SMTP_PASS'),
      },
    });
    this.from = `"${configService.get('MAIL_FROM_NAME', 'ERP SaaS')}" <${configService.get('MAIL_FROM')}>`;
  }

  async sendWelcome(to: string, name: string, companyName: string, trialDays: number) {
    return this.send(to, `Bienvenido a ERP SaaS, ${name}!`, this.wrap(`
      <h2>Bienvenido, ${name}!</h2>
      <p>Tu empresa <strong>${companyName}</strong> fue creada exitosamente.</p>
      <p>Tienes <strong>${trialDays} días de prueba gratuita</strong> con acceso completo.</p>
      <a href="${this.configService.get('FRONTEND_URL')}/subscription"
         style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">
        Activar suscripción
      </a>
    `));
  }

  async sendTrialExpired(to: string, companyName: string) {
    return this.send(to, 'Tu período de prueba ha expirado', this.wrap(`
      <h2 style="color:#DC2626;">Período de prueba expirado</h2>
      <p>El período de prueba de <strong>${companyName}</strong> venció.</p>
      <p>Activa un plan para recuperar el acceso completo:</p>
      <ul>
        <li><strong>Mensual</strong> — cancela cuando quieras</li>
        <li><strong>Trimestral</strong> — ~10% de ahorro</li>
        <li><strong>Anual</strong> — ~20% de ahorro</li>
      </ul>
      <a href="${this.configService.get('FRONTEND_URL')}/subscription"
         style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Ver planes
      </a>
    `));
  }

  async sendSubscriptionCanceled(to: string, companyName: string) {
    return this.send(to, 'Suscripción cancelada', this.wrap(`
      <h2>Suscripción cancelada</h2>
      <p>La suscripción de <strong>${companyName}</strong> fue cancelada.</p>
      <p>Tendrás acceso hasta el final del período actual.</p>
      <a href="${this.configService.get('FRONTEND_URL')}/subscription"
         style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Reactivar
      </a>
    `));
  }

  async sendPaymentFailed(to: string, companyName: string) {
    return this.send(to, 'Pago fallido — Actualiza tu método de pago', this.wrap(`
      <h2 style="color:#DC2626;">No pudimos procesar tu pago</h2>
      <p>El cobro de <strong>${companyName}</strong> falló.</p>
      <p>Actualiza tu método de pago para mantener el acceso.</p>
      <a href="${this.configService.get('FRONTEND_URL')}/subscription/portal"
         style="background:#DC2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Actualizar método de pago
      </a>
    `));
  }

  async sendQuotation(
    to: string,
    customerName: string,
    companyName: string,
    quotationNumber: string,
    validUntil: Date | null,
    total: number,
    pdfBuffer: Buffer,
    customMessage?: string,
  ) {
    const totalFormatted = Number(total).toLocaleString('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0,
    });
    const validStr = validUntil
      ? `<p>Esta cotización es válida hasta el <strong>${new Date(validUntil).toLocaleDateString('es-CO')}</strong>.</p>`
      : '';
    const customBlock = customMessage
      ? `<div style="background:#F0F9FF;border-left:4px solid #2563EB;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
           <p style="margin:0;color:#1E3A5F;">${customMessage}</p>
         </div>`
      : '';

    const html = this.wrap(`
      <h2>Estimado/a ${customerName},</h2>
      <p>Adjunto encontrará la cotización <strong>${quotationNumber}</strong> de <strong>${companyName}</strong>.</p>
      ${customBlock}
      <div style="background:#F8FAFC;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
        <p style="margin:0;font-size:13px;color:#64748B;">Total cotizado</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#1E3A5F;">${totalFormatted}</p>
      </div>
      ${validStr}
      <p>Si tiene alguna pregunta o desea proceder, no dude en contactarnos.</p>
    `);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Cotización ${quotationNumber} — ${companyName}`,
        html,
        attachments: [
          {
            filename: `${quotationNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(`Quotation email sent → ${to}: ${quotationNumber}`);
    } catch (err: unknown) {
      const message = this.getErrorMessage(err);
      this.logger.error(`Quotation email failed → ${to}: ${message}`);
      throw err;
    }
  }

  async sendInvoice(
    to: string,
    customerName: string,
    companyName: string,
    invoiceNumber: string,
    saleType: string,
    total: number,
    pdfBuffer: Buffer,
    customMessage?: string,
  ) {
    const totalFormatted = Number(total).toLocaleString('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0,
    });
    const typeLabel = saleType === 'CREDIT' ? 'Venta a crédito' : 'Venta de contado';
    const customBlock = customMessage
      ? `<div style="background:#F0F9FF;border-left:4px solid #2563EB;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
           <p style="margin:0;color:#1E3A5F;">${customMessage}</p>
         </div>`
      : '';

    const html = this.wrap(`
      <h2>Estimado/a ${customerName},</h2>
      <p>Adjunto encontrará la factura <strong>${invoiceNumber}</strong> de <strong>${companyName}</strong>.</p>
      ${customBlock}
      <div style="background:#F8FAFC;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
        <p style="margin:0;font-size:13px;color:#64748B;">${typeLabel} — Total</p>
        <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#1E3A5F;">${totalFormatted}</p>
      </div>
      <p>Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>
    `);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Factura ${invoiceNumber} — ${companyName}`,
        html,
        attachments: [
          {
            filename: `${invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(`Invoice email sent → ${to}: ${invoiceNumber}`);
    } catch (err: unknown) {
      const message = this.getErrorMessage(err);
      this.logger.error(`Invoice email failed → ${to}: ${message}`);
      throw err;
    }
  }

  async sendTicketConfirmation(
    to: string,
    userName: string,
    ticketNumber: string,
    type: string,
    subject: string,
  ) {
    const TYPE_LABELS: Record<string, string> = {
      CLAIM: 'Reclamación',
      COMPLAINT: 'Queja',
      SUGGESTION: 'Sugerencia',
      QUESTION: 'Pregunta',
      OTHER: 'Otro',
    };
    return this.send(to, `Ticket de soporte creado: ${ticketNumber}`, this.wrap(`
      <h2>Hola ${userName},</h2>
      <p>Tu solicitud de soporte ha sido recibida y está siendo atendida.</p>
      <div style="background:#F8FAFC;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#64748B;font-size:13px;">N° de ticket</td>
            <td style="padding:6px 0;font-weight:bold;color:#1E3A5F;">${ticketNumber}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748B;font-size:13px;">Tipo</td>
            <td style="padding:6px 0;">${TYPE_LABELS[type] || type}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748B;font-size:13px;">Asunto</td>
            <td style="padding:6px 0;">${subject}</td>
          </tr>
        </table>
      </div>
      <p>Te notificaremos cuando haya una respuesta. Puedes seguir el estado desde tu cuenta.</p>
    `));
  }

  /**
   * Notifica al dueño de la plataforma sobre un ticket recién creado.
   * Se envía a `SUPPORT_OWNER_EMAIL` (por defecto baherreras8@gmail.com)
   * para que el equipo pueda responder cuanto antes desde el panel.
   */
  async sendTicketAlertToOwner(params: {
    ticketNumber: string;
    type: string;
    priority: string;
    subject: string;
    message: string;
    companyName: string;
    userName: string;
    userEmail: string;
  }) {
    const ownerEmail = this.configService.get<string>(
      'SUPPORT_OWNER_EMAIL',
      'baherreras8@gmail.com',
    );
    if (!ownerEmail) return;

    const TYPE_LABELS: Record<string, string> = {
      CLAIM: 'Reclamación',
      COMPLAINT: 'Queja',
      SUGGESTION: 'Sugerencia',
      QUESTION: 'Pregunta',
      OTHER: 'Otro',
    };
    const PRIORITY_LABELS: Record<string, string> = {
      LOW: 'Baja',
      MEDIUM: 'Media',
      HIGH: 'Alta',
      URGENT: 'Urgente',
    };
    const priorityColor: Record<string, string> = {
      LOW: '#64748B',
      MEDIUM: '#2563EB',
      HIGH: '#F59E0B',
      URGENT: '#DC2626',
    };

    return this.send(
      ownerEmail,
      `[Ticket ${params.ticketNumber}] ${params.subject}`,
      this.wrap(`
        <h2>Nuevo ticket de soporte</h2>
        <p>Una empresa abrió un nuevo ticket que requiere tu atención.</p>
        <div style="background:#F8FAFC;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;width:130px;">N° de ticket</td>
              <td style="padding:6px 0;font-weight:bold;color:#1E3A5F;">${params.ticketNumber}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;">Empresa</td>
              <td style="padding:6px 0;font-weight:600;">${params.companyName}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;">Reportado por</td>
              <td style="padding:6px 0;">${params.userName} &lt;${params.userEmail}&gt;</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;">Tipo</td>
              <td style="padding:6px 0;">${TYPE_LABELS[params.type] || params.type}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;">Prioridad</td>
              <td style="padding:6px 0;">
                <span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${priorityColor[params.priority] || '#64748B'}15;color:${priorityColor[params.priority] || '#64748B'};font-weight:600;font-size:12px;">
                  ${PRIORITY_LABELS[params.priority] || params.priority}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748B;font-size:13px;vertical-align:top;">Asunto</td>
              <td style="padding:6px 0;font-weight:600;">${params.subject}</td>
            </tr>
          </table>
        </div>
        <div style="background:#FFF;border:1px solid #E2E8F0;border-radius:8px;padding:14px 18px;margin:16px 0;">
          <p style="margin:0 0 6px;color:#64748B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Mensaje</p>
          <p style="margin:0;color:#1E293B;white-space:pre-line;">${params.message}</p>
        </div>
        <a href="${this.configService.get('FRONTEND_URL')}/soporte"
           style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">
          Ver ticket en el panel
        </a>
      `),
    );
  }

  async sendTicketReply(
    to: string,
    userName: string,
    ticketNumber: string,
    subject: string,
    replyMessage: string,
  ) {
    return this.send(to, `Nueva respuesta en tu ticket ${ticketNumber}`, this.wrap(`
      <h2>Hola ${userName},</h2>
      <p>Hay una nueva respuesta en tu ticket de soporte <strong>${ticketNumber}</strong>.</p>
      <p style="font-size:13px;color:#64748B;">Asunto: ${subject}</p>
      <div style="background:#F0F9FF;border-left:4px solid #2563EB;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
        <p style="margin:0;color:#1E293B;">${replyMessage}</p>
      </div>
      <p>Ingresa a tu cuenta para ver el hilo completo y responder.</p>
    `));
  }

  /**
   * Notifica al admin de la empresa que un pago fue procesado exitosamente
   * (utilizado por la integración con Wompi al recibir un evento APPROVED).
   */
  async sendPaymentSuccess(to: string, companyName: string, plan: string) {
    return this.send(to, 'Pago confirmado — Suscripción activa', this.wrap(`
      <h2 style="color:#16A34A;">¡Pago confirmado!</h2>
      <p>El pago de <strong>${companyName}</strong> fue procesado exitosamente.</p>
      <p>Tu plan <strong>${plan}</strong> está ahora <strong>activo</strong>.</p>
      <a href="${this.configService.get('FRONTEND_URL')}/dashboard"
         style="background:#16A34A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Ir al dashboard
      </a>
    `));
  }

  async sendInvitation(
    to: string,
    companyName: string,
    inviterName: string,
    role: string,
    token: string,
    expiresAt: Date,
  ) {
    const link = `${this.configService.get('FRONTEND_URL')}/invitacion/${token}`;
    const expiresStr = new Date(expiresAt).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    return this.send(to, `Invitación para unirte a ${companyName}`, this.wrap(`
      <h2>Has sido invitado a ${companyName}</h2>
      <p><strong>${inviterName}</strong> te ha invitado a unirte a la organización
        <strong>${companyName}</strong> con el rol <strong>${role}</strong>.</p>
      <p>Para activar tu cuenta y crear tu contraseña, haz click en el botón:</p>
      <a href="${link}"
         style="background:#2563EB;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
        Aceptar invitación
      </a>
      <p style="font-size:13px;color:#64748B;">
        El enlace es válido hasta el <strong>${expiresStr}</strong>.
        Si no esperabas esta invitación, puedes ignorar este correo.
      </p>
      <p style="font-size:12px;color:#94A3B8;margin-top:24px;word-break:break-all;">
        ¿El botón no funciona? Copia este enlace en tu navegador:<br>${link}
      </p>
    `));
  }

  async sendLowStockAlert(to: string, products: { name: string; stock: number; min_stock?: number }[]) {
    const rows = products.map(p =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;">${p.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:center;color:#DC2626;">${p.stock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:center;">${p.min_stock ?? '-'}</td>
      </tr>`
    ).join('');
    return this.send(to, 'Alerta: Productos con stock bajo', this.wrap(`
      <h2>Alerta de stock bajo</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#1E3A5F;color:white;">
          <th style="padding:10px 12px;text-align:left;">Producto</th>
          <th style="padding:10px 12px;">Stock actual</th>
          <th style="padding:10px 12px;">Stock mínimo</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `));
  }

  private wrap(content: string): string {
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F8FAFC;margin:0;padding:20px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="background:#1E3A5F;padding:24px 32px;">
          <h1 style="color:white;margin:0;font-size:20px;">ERP SaaS</h1>
        </div>
        <div style="padding:32px;">${content}
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0;"/>
          <p style="color:#94A3B8;font-size:12px;">Mensaje automático — no responder.</p>
        </div>
      </div>
    </body></html>`;
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent → ${to}: ${subject}`);
    } catch (err: unknown) {
      const message = this.getErrorMessage(err);
      this.logger.error(`Email failed → ${to}: ${message}`);
      throw err;
    }
  }
}
