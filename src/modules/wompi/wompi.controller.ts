// ─────────────────────────────────────────────────────────────────────────────
// WompiController
// ─────────────────────────────────────────────────────────────────────────────
// Expone los endpoints REST de la pasarela de pago Wompi:
//
//   POST   /api/wompi/checkout     → crear payment link (autenticado)
//   GET    /api/wompi/transactions → listar histórico (autenticado)
//   GET    /api/wompi/transactions/:id → detalle (autenticado)
//   POST   /api/wompi/webhook      → recibir eventos de Wompi (PÚBLICO)
//
// El endpoint de webhook NO está protegido por JWT (Wompi llama desde sus
// servidores), pero sí valida la firma SHA-256 vía WompiService.
// Se excluye del TenantMiddleware en app.module.ts.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { WompiService } from './wompi.service';
import {
  CreateWompiCheckoutDto,
  WompiCheckoutResponseDto,
  WompiWebhookEventDto,
} from './dto/wompi.dto';
import { WompiTransaction } from './entities/wompi-transaction.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Wompi (Pasarela de Pago Colombia)')
@Controller('wompi')
export class WompiController {
  private readonly logger = new Logger(WompiController.name);

  constructor(private readonly wompiService: WompiService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/wompi/checkout
  // ───────────────────────────────────────────────────────────────────────────
  @Post('checkout')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Crear link de pago Wompi',
    description:
      'Genera una URL de Wompi Checkout para pagar la suscripción. ' +
      'El frontend debe redirigir al navegador a esa URL. ' +
      'Cuando el usuario completa (o cancela) el pago, Wompi enviará un webhook a /wompi/webhook.',
  })
  @ApiBody({
    type: CreateWompiCheckoutDto,
    examples: {
      mensual: {
        summary: 'Plan mensual',
        value: { plan: 'MONTHLY' },
      },
      anual: {
        summary: 'Plan anual con redirect personalizado',
        value: { plan: 'YEARLY', redirect_url: 'https://miapp.com/gracias' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Link de pago creado correctamente — redirigir al `checkout_url`',
    type: WompiCheckoutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Plan no soportado o credenciales no configuradas' })
  @ApiResponse({ status: 401, description: 'Token JWT inválido o ausente' })
  createCheckout(
    @Body() dto: CreateWompiCheckoutDto,
    @CurrentCompany() company: Company,
  ) {
    return this.wompiService.createCheckout(dto, company);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/wompi/transactions
  // ───────────────────────────────────────────────────────────────────────────
  @Get('transactions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar transacciones Wompi de la empresa',
    description: 'Devuelve las últimas N transacciones de pago Wompi de la empresa autenticada.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad máxima de transacciones a devolver (1-200, default 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de transacciones',
    type: [WompiTransaction],
  })
  list(
    @CurrentCompany() company: Company,
    @Query('limit') limit?: number,
  ) {
    return this.wompiService.listTransactions(company.id, Number(limit) || 50);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/wompi/transactions/:id
  // ───────────────────────────────────────────────────────────────────────────
  @Get('transactions/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detalle de una transacción Wompi' })
  @ApiParam({ name: 'id', description: 'ID interno (UUID) de la transacción' })
  @ApiResponse({ status: 200, type: WompiTransaction })
  @ApiResponse({ status: 404, description: 'Transacción no encontrada' })
  findOne(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
  ) {
    return this.wompiService.findOne(id, company.id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/wompi/sync   (autenticado — el FE lo llama al volver del checkout)
  // ───────────────────────────────────────────────────────────────────────────
  // El webhook de Wompi puede tardar segundos en llegar (o no llegar en
  // sandbox sin túnel). Para no dejar al usuario viendo el estado anterior,
  // el frontend llama a este endpoint al regresar de `/checkout.wompi.co`
  // con la `reference` que generamos. Aquí preguntamos a Wompi por el
  // estado real y, si está APPROVED, activamos la suscripción.
  // ───────────────────────────────────────────────────────────────────────────
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Forzar sincronización de una transacción Wompi',
    description:
      'Consulta el API de Wompi por la referencia indicada y actualiza ' +
      'el estado local. Si la transacción está APPROVED, activa la suscripción ' +
      'de la empresa. Idempotente: seguro de llamar múltiples veces.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reference'],
      properties: {
        reference: { type: 'string', example: 'ERP-abc123-MONTHLY-1700000000000' },
        transaction_id: {
          type: 'string',
          description:
            'Id que Wompi anexa en la URL de retorno (?id=…). Opcional pero recomendado: ' +
            'permite consultar GET /transactions/{id} directo y evita ambigüedad cuando ' +
            'hubo varios intentos sobre la misma referencia.',
          example: '15113-1559678200-49201',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        synced: true,
        status: 'APPROVED',
        plan: 'MONTHLY',
        payment_method_type: 'NEQUI',
      },
    },
  })
  sync(
    @Body() body: { reference?: string; transaction_id?: string },
    @CurrentCompany() company: Company,
  ) {
    if (!body?.reference || typeof body.reference !== 'string') {
      throw new BadRequestException('Falta la referencia');
    }
    return this.wompiService.syncByReference(
      body.reference,
      company.id,
      body.transaction_id,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/wompi/webhook   (público — usado por Wompi)
  // ───────────────────────────────────────────────────────────────────────────
  // Wompi llama este endpoint cada vez que cambia el estado de una transacción.
  // Validamos la firma SHA-256 antes de procesar.
  // Está excluido del TenantMiddleware (ver app.module.ts).
  // ───────────────────────────────────────────────────────────────────────────
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook de Wompi (público, llamado por Wompi)',
    description:
      'Endpoint que recibe los eventos `transaction.updated` de Wompi. ' +
      'No requiere autenticación JWT — la seguridad la da la firma `signature.checksum` ' +
      'que se valida contra `WOMPI_EVENTS_KEY`. Si la firma no coincide, se devuelve 401.',
  })
  @ApiBody({ type: WompiWebhookEventDto })
  @ApiResponse({ status: 200, description: 'Evento procesado' })
  @ApiResponse({ status: 401, description: 'Firma de webhook inválida' })
  async handleWebhook(@Body() event: WompiWebhookEventDto) {
    if (!event || !event.event) {
      throw new BadRequestException('Payload de webhook vacío');
    }

    const isValid = this.wompiService.verifyWebhookSignature(event);
    if (!isValid) {
      this.logger.warn('Webhook Wompi rechazado: firma inválida');
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    await this.wompiService.handleWebhook(event);
    return { received: true };
  }
}
