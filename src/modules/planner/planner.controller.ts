// ─────────────────────────────────────────────────────────────────────────────
// PlannerController — planeador diario por usuario
// ─────────────────────────────────────────────────────────────────────────────
// Cada usuario gestiona sus propios planes. Para ver los de otros se necesita
// el permiso `planner:view_all`.
// ─────────────────────────────────────────────────────────────────────────────
import type { Response } from 'express';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery, ApiProduces,
} from '@nestjs/swagger';
import { PlannerService } from './planner.service';
import {
  UpsertDailyPlanDto, FilterPlansDto,
  CreatePlanTaskDto, UpdatePlanTaskDto,
  CreatePlanVisitDto, UpdatePlanVisitDto,
} from './dto/planner.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

interface JwtPayload {
  sub: string;
  custom_permissions?: string[];
  [k: string]: any;
}

function ctxFrom(company: Company, user: JwtPayload) {
  return {
    companyId: company.id,
    userId: user.sub ?? user.id,
    permissions: user.custom_permissions ?? [],
  };
}

@ApiTags('Planner')
@ApiBearerAuth()
@Controller('planner')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  // ───────────────────── Planes ──────────────────────

  @Get()
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Listar planes del usuario autenticado (paginado)',
    description: 'Acepta filtros por rango de fechas. Para ver planes de otros '
      + 'usuarios envía `user_id` (requiere `planner:view_all`).',
  })
  findAll(
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
    @Query() filters: FilterPlansDto,
  ) {
    return this.plannerService.findAll(ctxFrom(company, user), filters);
  }

  @Get('day')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Plan de un día específico',
    description: 'Devuelve el plan del día indicado (lo crea en blanco si no existe '
      + 'y es del usuario autenticado).',
  })
  @ApiQuery({ name: 'date', required: true, example: '2026-05-08' })
  @ApiQuery({ name: 'user_id', required: false, description: 'Otro usuario (requiere planner:view_all)' })
  getDay(
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
    @Query('date') date: string,
    @Query('user_id') userId?: string,
  ) {
    return this.plannerService.getOrCreateForDate(date, ctxFrom(company, user), userId);
  }

  @Get('day/pdf')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Descargar el plan del día como PDF (con checkboxes y firma)',
    description:
      'Devuelve el plan del día con tareas, notas y visitas. Cada tarea trae '
      + 'una casilla para marcarla cumplida y cada visita una línea de firma '
      + 'de recibido. Usa el logo y los colores de la empresa.',
  })
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'date', required: true, example: '2026-05-12' })
  @ApiQuery({ name: 'user_id', required: false })
  async getDayPdf(
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
    @Query('date') date: string,
    @Res() res: Response,
    @Query('user_id') userId?: string,
  ) {
    const pdf = await this.plannerService.generateDayPdf(date, ctxFrom(company, user), userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="plan-${date}.pdf"`,
    );
    res.end(pdf);
  }

  @Get('summary')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Resumen de cumplimiento (para gráficas)',
    description: 'Conteo de planes, tasks/visits totales y completadas en el rango. '
      + 'Útil para mostrar el % de cumplimiento del usuario.',
  })
  @ApiQuery({ name: 'date_from', required: true, example: '2026-05-01' })
  @ApiQuery({ name: 'date_to', required: true, example: '2026-05-31' })
  @ApiQuery({ name: 'user_id', required: false })
  getSummary(
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
    @Query('date_from') dateFrom: string,
    @Query('date_to') dateTo: string,
    @Query('user_id') userId?: string,
  ) {
    return this.plannerService.getSummary(ctxFrom(company, user), dateFrom, dateTo, userId);
  }

  @Get(':id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Detalle de un plan (con tasks y visits ordenados)' })
  @ApiParam({ name: 'id', description: 'UUID del plan' })
  findOne(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.findOne(id, ctxFrom(company, user));
  }

  @Post()
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Crear o actualizar el plan del usuario para una fecha (upsert)',
    description: 'Idempotente: si ya existe un plan para esa fecha, solo actualiza `notes`.',
  })
  @ApiBody({ type: UpsertDailyPlanDto })
  upsert(
    @Body() dto: UpsertDailyPlanDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.upsertPlan(dto, ctxFrom(company, user));
  }

  @Delete(':id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Eliminar plan (soft delete) — solo el dueño' })
  @ApiParam({ name: 'id', description: 'UUID del plan' })
  remove(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.remove(id, ctxFrom(company, user));
  }

  // ───────────────────── Tasks ──────────────────────

  @Post(':planId/tasks')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Añadir tarea pendiente al plan' })
  @ApiParam({ name: 'planId', description: 'UUID del plan' })
  @ApiBody({ type: CreatePlanTaskDto })
  addTask(
    @Param('planId') planId: string,
    @Body() dto: CreatePlanTaskDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.addTask(planId, dto, ctxFrom(company, user));
  }

  @Patch('tasks/:id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Actualizar tarea',
    description: 'Marca/desmarca como hecha (`is_done`) y registra `done_at` automáticamente.',
  })
  @ApiParam({ name: 'id', description: 'UUID de la tarea' })
  @ApiBody({ type: UpdatePlanTaskDto })
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdatePlanTaskDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.updateTask(id, dto, ctxFrom(company, user));
  }

  @Delete('tasks/:id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Eliminar tarea' })
  @ApiParam({ name: 'id', description: 'UUID de la tarea' })
  removeTask(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.removeTask(id, ctxFrom(company, user));
  }

  // ───────────────────── Visits ──────────────────────

  @Post(':planId/visits')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({
    summary: 'Añadir visita a cliente al plan',
    description: 'Si envías `customer_id`, autocompleta `customer_name` y `address`. '
      + 'También permite visitas libres (prospectos sin registrar) enviando solo `customer_name`.',
  })
  @ApiParam({ name: 'planId', description: 'UUID del plan' })
  @ApiBody({ type: CreatePlanVisitDto })
  addVisit(
    @Param('planId') planId: string,
    @Body() dto: CreatePlanVisitDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.addVisit(planId, dto, ctxFrom(company, user));
  }

  @Patch('visits/:id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Actualizar visita (marcar visitada/saltada, cambiar hora, etc.)' })
  @ApiParam({ name: 'id', description: 'UUID de la visita' })
  @ApiBody({ type: UpdatePlanVisitDto })
  updateVisit(
    @Param('id') id: string,
    @Body() dto: UpdatePlanVisitDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.updateVisit(id, dto, ctxFrom(company, user));
  }

  @Delete('visits/:id')
  @Permissions(Permission.PLANNER_USE)
  @ApiOperation({ summary: 'Eliminar visita' })
  @ApiParam({ name: 'id', description: 'UUID de la visita' })
  removeVisit(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.plannerService.removeVisit(id, ctxFrom(company, user));
  }
}
