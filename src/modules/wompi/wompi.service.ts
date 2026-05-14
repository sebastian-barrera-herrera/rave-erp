// ─────────────────────────────────────────────────────────────────────────────
// WompiService
// ─────────────────────────────────────────────────────────────────────────────
// Encapsula toda la lógica de negocio relacionada con la pasarela de pago
// Wompi (Colombia). Funcionalidades:
//
//   1. Crear "Payment Links" hospedados — el usuario paga directamente en
//      la página de Wompi (no necesitamos PCI compliance).
//   2. Recibir webhooks de Wompi y validar su firma (HMAC-SHA256).
//   3. Reflejar el estado de cada transacción en la tabla wompi_transactions.
//   4. Cuando una transacción se aprueba, activar la suscripción de la empresa
//      y extender la fecha de vencimiento.
//
// Documentación oficial:
//   - API:      https://docs.wompi.co/api/
//   - Webhooks: https://docs.wompi.co/docs/colombia/eventos/
//   - Firmas:   https://docs.wompi.co/docs/colombia/firmas-de-integridad/
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { Company } from '../companies/entities/company.entity';
import {
  WompiTransaction,
  WompiTransactionStatus,
} from './entities/wompi-transaction.entity';
import {
  CreateWompiCheckoutDto,
  WompiWebhookEventDto,
} from './dto/wompi.dto';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../common/types/enums';
import { MailService } from '../../shared/services/mail.service';
import { MemoryCacheService } from '../../shared/services/cache.service';
import { tenantCompanyCacheKey } from '../../common/middleware/tenant.middleware';

@Injectable()
export class WompiService implements OnModuleInit {
  private readonly logger = new Logger(WompiService.name);

  /** Cliente HTTP preconfigurado contra el sandbox o producción de Wompi */
  private http!: AxiosInstance;

  /** URL base del API de Wompi (sandbox o producción) */
  private apiUrl!: string;

  /** Llave pública (se envía al frontend / al checkout hospedado) */
  private publicKey!: string;

  /** Llave privada (server-side, NO exponer al cliente) */
  private privateKey!: string;

  /** Secreto para validar firmas de eventos de webhook */
  private eventsKey!: string;

  /**
   * Secreto de integridad — se concatena con la referencia + monto + moneda
   * para crear la firma que Wompi exige al iniciar un checkout.
   */
  private integrityKey!: string;

  /**
   * Precios reales del producto, expresados en centavos (lo que pide Wompi).
   *   Mensual:    $10.000 COP  → 1_000_000 centavos
   *   Trimestral: $27.000 COP  → 2_700_000 centavos  (10% off)
   *   Anual:      $96.000 COP  → 9_600_000 centavos  (20% off)
   */
  private readonly PLAN_AMOUNTS_COP: Record<SubscriptionPlan, number> = {
    [SubscriptionPlan.MONTHLY]: 1_000_000,
    [SubscriptionPlan.QUARTERLY]: 2_700_000,
    [SubscriptionPlan.YEARLY]: 9_600_000,
  };

  constructor(
    @InjectRepository(WompiTransaction)
    private readonly txRepo: Repository<WompiTransaction>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly cache: MemoryCacheService,
  ) {}

  /**
   * Lee las credenciales desde variables de entorno y prepara el cliente HTTP.
   * Si falta cualquier credencial obligatoria, falla el arranque para evitar
   * que el servicio quede mal configurado en silencio.
   */
  onModuleInit() {
    this.apiUrl = this.configService.get<string>(
      'WOMPI_API_URL',
      'https://sandbox.wompi.co/v1',
    );
    this.publicKey = this.configService.get<string>('WOMPI_PUBLIC_KEY') ?? '';
    this.privateKey = this.configService.get<string>('WOMPI_PRIVATE_KEY') ?? '';
    this.eventsKey = this.configService.get<string>('WOMPI_EVENTS_KEY') ?? '';
    this.integrityKey = this.configService.get<string>('WOMPI_INTEGRITY_KEY') ?? '';

    if (!this.publicKey || !this.privateKey) {
      this.logger.warn(
        'WOMPI_PUBLIC_KEY / WOMPI_PRIVATE_KEY no configuradas — el módulo Wompi quedará inactivo',
      );
      return;
    }

    this.http = axios.create({
      baseURL: this.apiUrl,
      timeout: 15_000,
      headers: {
        Authorization: `Bearer ${this.privateKey}`,
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`Wompi inicializado: ${this.apiUrl}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1) Crear Payment Link (checkout hospedado)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Genera un Payment Link en Wompi para que la empresa pague su suscripción.
   * Devuelve la URL a la que el frontend debe redirigir al navegador.
   *
   * Pasos:
   *   1. Calcula el monto según el plan elegido.
   *   2. Genera una referencia única (idempotente para esta empresa+plan).
   *   3. Calcula el "integrity hash" exigido por Wompi.
   *   4. Llama a POST /payment_links creando el link.
   *   5. Persiste un WompiTransaction con estado PENDING.
   *
   * @param dto      DTO con plan y opcional redirect_url
   * @param company  Empresa (multi-tenant) que solicita el cobro
   */
  async createCheckout(dto: CreateWompiCheckoutDto, company: Company) {
    if (!this.privateKey) {
      throw new BadRequestException('Wompi no está configurado en el servidor');
    }

    const amount = this.PLAN_AMOUNTS_COP[dto.plan];
    if (!amount) {
      throw new BadRequestException(`Plan "${dto.plan}" no soportado en Wompi`);
    }

    const currency = 'COP';
    const reference = this.buildReference(company.id, dto.plan);
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://raverp.netlify.app/',
    );
    // Aseguramos que el redirect siempre lleve `wompi=success&ref=…` para
    // que el frontend pueda disparar el sync manual al regresar (la red de
    // seguridad cuando el webhook tarda o no llega — p.ej. en sandbox sin
    // túnel público).
    const redirectUrl = this.appendCheckoutParams(
      dto.redirect_url ?? `${frontendUrl}/suscripcion`,
      reference,
    );

    // El "integrity signature" es SHA256(reference + amount + currency + integrityKey)
    const integritySignature = this.generateIntegritySignature(
      reference,
      amount,
      currency,
    );

    // Cuerpo según https://docs.wompi.co/docs/colombia/widget-checkout-web/
    const body = {
      name: `Suscripción ERP — Plan ${dto.plan}`,
      description: `Pago de suscripción plan ${dto.plan} para ${company.name}`,
      single_use: true,
      currency,
      amount_in_cents: amount,
      collect_shipping: false,
      collect_customer_legal_id: false,
      redirect_url: redirectUrl,
      // Wompi acepta metadata libre — la usamos para correlacionar el webhook
      metadata: {
        company_id: company.id,
        plan: dto.plan,
        reference,
      },
      // La firma de integridad va en el campo "integrity_signature"
      integrity_signature: integritySignature,
    };

    let checkoutUrl: string;
    try {
      const { data } = await this.http.post('/payment_links', body);
      // Wompi devuelve { data: { id: "linkId", ... } } — armamos la URL del checkout
      const linkId: string = data?.data?.id;
      if (!linkId) {
        throw new Error('Respuesta inválida de Wompi al crear payment link');
      }
      // El link público sigue el patrón:
      //   https://checkout.wompi.co/l/{linkId}
      checkoutUrl = `https://checkout.wompi.co/l/${linkId}`;
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      this.logger.error(
        `Error al crear payment link Wompi: ${JSON.stringify(detail)}`,
      );
      throw new BadRequestException('No se pudo crear el link de pago en Wompi');
    }

    // Guardamos la transacción en estado PENDING; el webhook la actualizará
    const transaction = this.txRepo.create({
      company_id: company.id,
      reference,
      plan: dto.plan,
      amount_in_cents: amount,
      currency,
      customer_email: company.email,
      status: WompiTransactionStatus.PENDING,
      checkout_url: checkoutUrl,
    });
    await this.txRepo.save(transaction);

    return {
      checkout_url: checkoutUrl,
      reference,
      transaction_id: transaction.id,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2) Webhook handler
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Procesa un evento entrante de Wompi (POST /api/wompi/webhook).
   * Debe haberse validado la firma ANTES de llamar a este método.
   *
   * Wompi solo envía un tipo de evento: "transaction.updated".
   * El estado final puede ser APPROVED, DECLINED, VOIDED o ERROR.
   */
  async handleWebhook(event: WompiWebhookEventDto) {
    const tx = event.data?.transaction;
    if (!tx) {
      this.logger.warn('Webhook Wompi sin objeto transaction — ignorado');
      return;
    }

    // Buscamos la transacción local por nuestra referencia
    const local = await this.txRepo.findOne({
      where: { reference: tx.reference },
    });
    if (!local) {
      // No existe localmente — puede ser un pago iniciado fuera de nuestro flujo.
      // Lo logueamos pero no fallamos para que Wompi no nos reintente.
      this.logger.warn(`Transacción Wompi desconocida: ref=${tx.reference}`);
      return;
    }

    // Mapeo del estado oficial de Wompi al nuestro
    const statusMap: Record<string, WompiTransactionStatus> = {
      APPROVED: WompiTransactionStatus.APPROVED,
      DECLINED: WompiTransactionStatus.DECLINED,
      VOIDED: WompiTransactionStatus.VOIDED,
      ERROR: WompiTransactionStatus.ERROR,
      PENDING: WompiTransactionStatus.PENDING,
    };

    local.status = statusMap[tx.status] ?? WompiTransactionStatus.ERROR;
    local.wompi_transaction_id = tx.id;
    local.payment_method_type = tx.payment_method_type ?? local.payment_method_type;
    local.raw_payload = tx as unknown as Record<string, any>;
    await this.txRepo.save(local);

    // Si la transacción es APPROVED → activar la suscripción de la empresa
    if (local.status === WompiTransactionStatus.APPROVED && local.plan) {
      await this.activateSubscription(local.company_id, local.plan);
    }
  }

  /**
   * Activa la suscripción de una empresa luego de un pago aprobado.
   * Calcula la nueva fecha de vencimiento según el plan y persiste todo.
   */
  private async activateSubscription(companyId: string, plan: SubscriptionPlan) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      this.logger.error(`Empresa ${companyId} no encontrada al activar plan`);
      return;
    }

    const now = new Date();
    const ends = new Date(now);

    switch (plan) {
      case SubscriptionPlan.MONTHLY:
        ends.setMonth(ends.getMonth() + 1);
        break;
      case SubscriptionPlan.QUARTERLY:
        ends.setMonth(ends.getMonth() + 3);
        break;
      case SubscriptionPlan.YEARLY:
        ends.setFullYear(ends.getFullYear() + 1);
        break;
    }

    company.subscription_status = SubscriptionStatus.ACTIVE;
    company.subscription_plan = plan;
    company.subscription_ends_at = ends;
    company.next_billing_date = ends;
    company.subscription_started_at = now;
    // Si había una cancelación pendiente y vuelve a pagar, la borramos.
    company.subscription_cancel_at = null as unknown as Date;
    await this.companyRepo.save(company);

    // Invalidamos el cache de tenant para que la siguiente petición de la
    // app no siga leyendo la copia anterior (subscription_status TRIAL/EXPIRED)
    // durante los hasta 60s del TTL — sin esto el usuario veía "no se reflejó".
    this.cache.delete(tenantCompanyCacheKey(company.id));

    this.logger.log(
      `Suscripción ACTIVADA via Wompi para empresa ${company.name} (plan ${plan})`,
    );

    // Notificación al admin de la empresa (no bloquea el webhook si falla)
    this.mailService
      .sendPaymentSuccess?.(company.email, company.name, plan)
      ?.catch?.((e: any) =>
        this.logger.warn(`Email confirmación pago Wompi falló: ${e.message}`),
      );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3) Validación de firmas
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Valida la firma SHA-256 del evento de webhook contra WOMPI_EVENTS_KEY.
   *
   * Wompi envía:
   *   signature.properties: lista ordenada de campos del payload
   *   signature.checksum:    SHA256(<concatenación de los valores> + timestamp + eventsKey)
   *
   * Si la firma no concuerda, hay que rechazar la petición (probable manipulación).
   */
  verifyWebhookSignature(event: WompiWebhookEventDto): boolean {
    if (!this.eventsKey) {
      this.logger.warn(
        'WOMPI_EVENTS_KEY no configurada — todos los webhooks serán rechazados',
      );
      return false;
    }

    if (!event?.signature?.properties || !event?.signature?.checksum) {
      return false;
    }

    // Reconstruimos la cadena: concatenación de valores en el orden indicado
    const concatenated =
      event.signature.properties
        .map((prop) => this.getValueByPath(event, `data.${prop}`))
        .join('') +
      String(event.timestamp) +
      this.eventsKey;

    const expected = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex');

    const provided = event.signature.checksum.toLowerCase();
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(provided, 'utf8'),
    );
  }

  /**
   * Calcula el integrity_signature requerido al crear un payment link.
   * Fórmula: SHA256(reference + amount + currency + integrityKey)
   */
  private generateIntegritySignature(
    reference: string,
    amount: number,
    currency: string,
  ): string {
    const raw = `${reference}${amount}${currency}${this.integrityKey}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4) Lectura / consulta
  // ───────────────────────────────────────────────────────────────────────────

  /** Devuelve las últimas N transacciones de la empresa (para historial UI) */
  async listTransactions(companyId: string, limit = 50) {
    return this.txRepo.find({
      where: { company_id: companyId },
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /** Devuelve una transacción puntual de la empresa */
  async findOne(id: string, companyId: string) {
    const tx = await this.txRepo.findOne({
      where: { id, company_id: companyId },
    });
    if (!tx) throw new NotFoundException('Transacción Wompi no encontrada');
    return tx;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5) Sincronización manual (fallback al webhook)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Consulta el estado real de una transacción contra el API de Wompi y
   * actualiza la copia local. Se usa cuando el usuario regresa al frontend
   * tras completar el checkout: el frontend llama a este endpoint para
   * forzar la actualización sin esperar al webhook (que en sandbox suele
   * no llegar, y en producción puede tardar segundos).
   *
   * Acepta dos formas de identificar la transacción:
   *   - `transactionId`: id que Wompi asigna y anexa en la URL de retorno
   *     (`?id=<wompi_tx_id>`). Es el más confiable porque va directo a
   *     GET /transactions/{id} y devuelve siempre la misma tx.
   *   - `reference`:     nuestra referencia interna. Útil como fallback
   *     y para que el FE pueda recuperar la última transacción de la
   *     empresa si el `id` no está disponible.
   *
   * Es idempotente: si la copia local ya está al día, llamarlo de nuevo
   * no causa efectos colaterales. La activación de la suscripción solo
   * dispara la primera vez que la tx pasa a APPROVED.
   */
  async syncByReference(
    reference: string,
    companyId: string,
    transactionId?: string,
  ) {
    if (!this.privateKey) {
      throw new BadRequestException('Wompi no está configurado en el servidor');
    }

    const local = await this.txRepo.findOne({
      where: { reference, company_id: companyId },
    });
    if (!local) {
      throw new NotFoundException('Transacción no encontrada');
    }

    const remote = await this.fetchRemoteTransaction({
      reference,
      transactionId: transactionId ?? local.wompi_transaction_id,
    });

    if (!remote) {
      // Wompi aún no tiene la transacción registrada — esto pasa los
      // primeros segundos justo después de que el usuario aprueba el pago.
      // Devolvemos el estado local para que el frontend siga puliendo.
      return {
        synced: false,
        status: local.status,
        plan: local.plan,
        payment_method_type: local.payment_method_type ?? null,
      };
    }

    const statusMap: Record<string, WompiTransactionStatus> = {
      APPROVED: WompiTransactionStatus.APPROVED,
      DECLINED: WompiTransactionStatus.DECLINED,
      VOIDED: WompiTransactionStatus.VOIDED,
      ERROR: WompiTransactionStatus.ERROR,
      PENDING: WompiTransactionStatus.PENDING,
    };

    const newStatus = statusMap[remote.status] ?? local.status;
    const wasApproved = local.status === WompiTransactionStatus.APPROVED;
    local.status = newStatus;
    local.wompi_transaction_id = remote.id ?? local.wompi_transaction_id;
    local.payment_method_type =
      remote.payment_method_type ??
      remote.payment_method?.type ??
      local.payment_method_type;
    local.raw_payload = remote;
    await this.txRepo.save(local);

    // Sólo activamos suscripción la primera vez que pasa a APPROVED — si
    // ya estaba APPROVED desde antes (idempotencia), no repetimos el correo.
    if (
      !wasApproved &&
      local.status === WompiTransactionStatus.APPROVED &&
      local.plan
    ) {
      await this.activateSubscription(local.company_id, local.plan);
    }

    return {
      synced: true,
      status: local.status,
      plan: local.plan,
      payment_method_type: local.payment_method_type ?? null,
    };
  }

  /**
   * Consulta una transacción contra Wompi tratando de obtener la versión
   * más definitiva posible. Si tenemos el `transactionId` que Wompi nos
   * dio (vía URL de retorno o webhook previo), GET /transactions/{id}
   * devuelve siempre la misma tx — esto es lo correcto cuando hay varios
   * intentos sobre la misma referencia. Si solo tenemos `reference`,
   * caemos al listado y preferimos la APPROVED si ya existe; si todas
   * están PENDING, devolvemos la más reciente.
   *
   * Maneja la inconsistencia de Wompi: `data` puede venir como objeto
   * (endpoint /{id}) o como array (endpoint con ?reference=).
   */
  private async fetchRemoteTransaction(opts: {
    reference: string;
    transactionId?: string;
  }): Promise<any | null> {
    const { reference, transactionId } = opts;

    // 1) Camino directo por id — el más confiable.
    if (transactionId) {
      try {
        const { data } = await this.http.get(
          `/transactions/${encodeURIComponent(transactionId)}`,
        );
        const tx = data?.data;
        if (tx && tx.id) return tx;
      } catch (err: any) {
        const detail = err?.response?.data ?? err?.message;
        this.logger.warn(
          `Sync Wompi por id=${transactionId} falló: ${JSON.stringify(detail)} — caigo a búsqueda por reference`,
        );
      }
    }

    // 2) Fallback por referencia. Wompi devuelve un array con todos los
    //    intentos asociados a esa referencia.
    try {
      const { data } = await this.http.get('/transactions', {
        params: { reference },
      });
      // `data.data` casi siempre es un array para este endpoint, pero
      // toleramos también el caso de objeto único por si Wompi cambia.
      const list: any[] = Array.isArray(data?.data)
        ? data.data
        : data?.data
          ? [data.data]
          : [];
      if (!list.length) return null;
      // Si alguna ya está APPROVED, esa es la fuente de verdad — sólo
      // se aprueba una vez. Si no, devolvemos la más reciente para
      // poder mostrar el estado más actual (DECLINED, PENDING, etc.).
      return (
        list.find((t: any) => t?.status === 'APPROVED') ??
        [...list].sort((a: any, b: any) =>
          String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')),
        )[0] ??
        null
      );
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      this.logger.warn(
        `Sync Wompi por reference=${reference} falló: ${JSON.stringify(detail)}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Anexa `wompi=success&ref=<reference>` a la URL de retorno sin duplicar
   * parámetros ni romper la query si el caller ya la trae.
   */
  private appendCheckoutParams(url: string, reference: string): string {
    const sep = url.includes('?') ? '&' : '?';
    const hasRef = /[?&]ref=/.test(url);
    const hasFlag = /[?&]wompi=/.test(url);
    const extras: string[] = [];
    if (!hasFlag) extras.push('wompi=success');
    if (!hasRef) extras.push(`ref=${encodeURIComponent(reference)}`);
    return extras.length ? `${url}${sep}${extras.join('&')}` : url;
  }

  /** Genera una referencia única e idempotente por minuto */
  private buildReference(companyId: string, plan: SubscriptionPlan): string {
    // Usamos timestamp en segundos para que dos clicks rápidos del usuario
    // generen la misma referencia (Wompi rechaza referencias duplicadas).
    const slug = companyId.replace(/-/g, '').slice(0, 12);
    return `ERP-${slug}-${plan}-${Date.now()}`;
  }

  /** Recorre un objeto siguiendo un path "a.b.c" para extraer valores anidados */
  private getValueByPath(obj: any, path: string): string {
    const value = path.split('.').reduce((acc, key) => acc?.[key], obj);
    return value === undefined || value === null ? '' : String(value);
  }
}
