// ─────────────────────────────────────────────────────────────────────────────
// SupportController — sistema de tickets internos
// ─────────────────────────────────────────────────────────────────────────────
// Reglas:
//   - Cualquier usuario autenticado puede abrir un ticket sobre sí mismo.
//   - Sólo ADMIN/MANAGER ven tickets de otros usuarios y pueden cambiar estado.
//   - Cuando staff responde, el ticket pasa a IN_PROGRESS.
//   - Cuando se marca RESOLVED, se notifica al usuario por email.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  CreateTicketDto, UpdateTicketDto, AddMessageDto, FilterTicketsDto,
} from './dto/support.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar tickets',
    description:
      'Cualquier usuario autenticado ve SUS propios tickets. Staff con SUPPORT_MANAGE ve los de toda la empresa.',
  })
  findAll(
    @CurrentCompany() company: Company,
    @Query() filters: FilterTicketsDto,
    @CurrentUser() user: any,
  ) {
    return this.supportService.findAll(company.id, filters, user.id, user.role);
  }

  @Get('stats')
  @Permissions(Permission.SUPPORT_MANAGE)
  @ApiOperation({ summary: 'Estadísticas de tickets (por estado y por tipo)' })
  getStats(@CurrentCompany() company: Company) {
    return this.supportService.getStats(company.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ticket con todos sus mensajes' })
  @ApiParam({ name: 'id', description: 'UUID del ticket' })
  findOne(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.supportService.findOne(id, company.id, user.id, user.role);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear ticket nuevo',
    description:
      'Cualquier usuario autenticado puede abrir un ticket — sin importar su rol o permisos.',
  })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: 'Ticket creado y email de confirmación enviado' })
  create(
    @Body() dto: CreateTicketDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.supportService.create(dto, company.id, user.id);
  }

  @Patch(':id/status')
  @Permissions(Permission.SUPPORT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar estado o prioridad del ticket (sólo staff)',
    description: 'Si se cambia a RESOLVED/CLOSED, se setea automáticamente `resolved_at`.',
  })
  @ApiParam({ name: 'id', description: 'UUID del ticket' })
  @ApiBody({ type: UpdateTicketDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentCompany() company: Company,
  ) {
    return this.supportService.updateStatus(id, dto, company.id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Responder al ticket',
    description: 'Si responde staff, el ticket pasa a IN_PROGRESS y se notifica al usuario.',
  })
  @ApiParam({ name: 'id', description: 'UUID del ticket' })
  @ApiBody({ type: AddMessageDto })
  addMessage(
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.supportService.addMessage(id, dto, company.id, user.id, user.role);
  }
}
