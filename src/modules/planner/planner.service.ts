import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyPlan } from './entities/daily-plan.entity';
import { PlanTask } from './entities/plan-task.entity';
import { PlanVisit } from './entities/plan-visit.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Company } from '../companies/entities/company.entity';
import {
  UpsertDailyPlanDto, FilterPlansDto,
  CreatePlanTaskDto, UpdatePlanTaskDto,
  CreatePlanVisitDto, UpdatePlanVisitDto,
} from './dto/planner.dto';
import { paginate } from '../../common/types/pagination.type';
import { Permission } from '../../common/types/enums';
import { PdfService } from '../pdf/pdf.service';

interface AuthCtx {
  companyId: string;
  userId: string;
  permissions: string[];
}

@Injectable()
export class PlannerService {
  constructor(
    @InjectRepository(DailyPlan)
    private readonly planRepo: Repository<DailyPlan>,
    @InjectRepository(PlanTask)
    private readonly taskRepo: Repository<PlanTask>,
    @InjectRepository(PlanVisit)
    private readonly visitRepo: Repository<PlanVisit>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Genera el PDF del plan diario (con checkboxes y firma).
   * Si la fecha no tiene plan se devuelve uno vacío para que el vendedor
   * pueda imprimir el formato igualmente.
   */
  async generateDayPdf(date: string, ctx: AuthCtx, ofUserId?: string): Promise<Buffer> {
    const targetUserId = this.resolveTargetUserId(ctx, ofUserId);

    let plan = await this.planRepo.findOne({
      where: { user_id: targetUserId, plan_date: date, company_id: ctx.companyId },
      relations: ['user', 'visits', 'visits.customer', 'tasks'],
    });

    if (!plan) {
      // No persistimos un plan vacío solo por imprimirlo — sintetizamos uno.
      plan = {
        id: 'preview',
        company_id: ctx.companyId,
        user_id: targetUserId,
        plan_date: date,
        notes: null,
        tasks: [],
        visits: [],
        user: null,
      } as any;
    }

    const company = await this.companyRepo.findOne({ where: { id: ctx.companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return this.pdfService.generateDailyPlan(plan, company);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Planes
  // ───────────────────────────────────────────────────────────────────────────

  /** Crea o devuelve el plan del usuario para esa fecha (idempotente). */
  async upsertPlan(dto: UpsertDailyPlanDto, ctx: AuthCtx) {
    // Normalizamos la fecha a YYYY-MM-DD por si llegan timestamps completos.
    const planDate = String(dto.plan_date).slice(0, 10);

    let plan = await this.planRepo.findOne({
      where: {
        company_id: ctx.companyId,
        user_id: ctx.userId,
        plan_date: planDate,
      },
    });

    if (plan) {
      if (dto.notes !== undefined) {
        plan.notes = dto.notes;
        await this.planRepo.save(plan);
      }
      return this.findOne(plan.id, ctx);
    }

    // Race-safety: si entre el SELECT y el INSERT otro request crea el plan,
    // capturamos la violación de UQ y devolvemos el plan existente.
    try {
      plan = this.planRepo.create({
        company_id: ctx.companyId,
        user_id: ctx.userId,
        plan_date: planDate,
        notes: dto.notes,
      });
      const saved = await this.planRepo.save(plan);
      return this.findOne(saved.id, ctx);
    } catch (err: any) {
      if (err?.code === '23505') {
        const existing = await this.planRepo.findOne({
          where: {
            company_id: ctx.companyId,
            user_id: ctx.userId,
            plan_date: planDate,
          },
        });
        if (existing) {
          if (dto.notes !== undefined) {
            existing.notes = dto.notes;
            await this.planRepo.save(existing);
          }
          return this.findOne(existing.id, ctx);
        }
      }
      throw err;
    }
  }

  async findAll(ctx: AuthCtx, filters: FilterPlansDto) {
    const targetUserId = this.resolveTargetUserId(ctx, filters.user_id);
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 100);

    const qb = this.planRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .loadRelationCountAndMap('p.tasks_count', 'p.tasks')
      .loadRelationCountAndMap('p.tasks_done_count', 'p.tasks', 't', (q) =>
        q.where('t.is_done = true'))
      .loadRelationCountAndMap('p.visits_count', 'p.visits')
      .select([
        'p.id', 'p.plan_date', 'p.notes', 'p.created_at', 'p.updated_at',
        'u.id', 'u.name',
      ])
      .where('p.company_id = :cid', { cid: ctx.companyId })
      .andWhere('p.user_id = :uid', { uid: targetUserId })
      .andWhere('p.deleted_at IS NULL');

    if (filters.date_from) qb.andWhere('p.plan_date >= :df', { df: filters.date_from });
    if (filters.date_to) qb.andWhere('p.plan_date <= :dt', { dt: filters.date_to });

    qb.orderBy('p.plan_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  /**
   * Busca el plan por fecha. Si no existe lo CREA en blanco — esto evita
   * el error "no encontrado" cuando el usuario abre la pantalla del día.
   */
  async getOrCreateForDate(date: string, ctx: AuthCtx, ofUserId?: string) {
    const targetUserId = this.resolveTargetUserId(ctx, ofUserId);

    let plan = await this.planRepo.findOne({
      where: { user_id: targetUserId, plan_date: date },
    });
    if (!plan && targetUserId === ctx.userId) {
      plan = this.planRepo.create({
        company_id: ctx.companyId,
        user_id: ctx.userId,
        plan_date: date,
      });
      plan = await this.planRepo.save(plan);
    }
    if (!plan) throw new NotFoundException('No hay plan para esa fecha');
    return this.findOne(plan.id, ctx);
  }

  async findOne(id: string, ctx: AuthCtx) {
    // Cargamos las relaciones por separado para que un dato inconsistente
    // en una de ellas (p. ej. visit.customer huérfano) no haga reventar
    // todo el endpoint.
    const plan = await this.planRepo.findOne({
      where: { id, company_id: ctx.companyId },
      relations: ['user'],
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    this.assertCanAccess(plan, ctx);

    plan.tasks = (plan.tasks || []).sort(
      (a, b) =>
        (a.order - b.order) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    plan.visits = (plan.visits || []).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      if (a.scheduled_time && b.scheduled_time) {
        return a.scheduled_time.localeCompare(b.scheduled_time);
      }
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return plan;
  }

  async remove(id: string, ctx: AuthCtx) {
    const plan = await this.planRepo.findOne({ where: { id, company_id: ctx.companyId } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    if (plan.user_id !== ctx.userId) {
      throw new ForbiddenException('Solo puedes eliminar tus propios planes');
    }
    await this.planRepo.softDelete(id);
    return { message: 'Plan eliminado' };
  }

  /**
   * Resumen de cumplimiento en un rango de fechas (para gráficas).
   * Cuenta tasks totales, tasks hechas, visitas totales, visitas hechas y skipped.
   */
  async getSummary(ctx: AuthCtx, dateFrom: string, dateTo: string, ofUserId?: string) {
    const targetUserId = this.resolveTargetUserId(ctx, ofUserId);

    const result = await this.planRepo
      .createQueryBuilder('p')
      .leftJoin('p.tasks', 't')
      .leftJoin('p.visits', 'v')
      .select('COUNT(DISTINCT p.id)', 'plans')
      .addSelect('COUNT(DISTINCT t.id)', 'tasks_total')
      .addSelect(`COUNT(DISTINCT CASE WHEN t.is_done THEN t.id END)`, 'tasks_done')
      .addSelect('COUNT(DISTINCT v.id)', 'visits_total')
      .addSelect(`COUNT(DISTINCT CASE WHEN v.status = 'VISITED' THEN v.id END)`, 'visits_done')
      .addSelect(`COUNT(DISTINCT CASE WHEN v.status = 'SKIPPED' THEN v.id END)`, 'visits_skipped')
      .where('p.company_id = :cid', { cid: ctx.companyId })
      .andWhere('p.user_id = :uid', { uid: targetUserId })
      .andWhere('p.plan_date BETWEEN :from AND :to', { from: dateFrom, to: dateTo })
      .andWhere('p.deleted_at IS NULL')
      .getRawOne<{
        plans: string; tasks_total: string; tasks_done: string;
        visits_total: string; visits_done: string; visits_skipped: string;
      }>();

    const tasksTotal = Number(result?.tasks_total ?? 0);
    const tasksDone = Number(result?.tasks_done ?? 0);
    const visitsTotal = Number(result?.visits_total ?? 0);
    const visitsDone = Number(result?.visits_done ?? 0);

    return {
      user_id: targetUserId,
      range: { from: dateFrom, to: dateTo },
      plans: Number(result?.plans ?? 0),
      tasks: {
        total: tasksTotal,
        done: tasksDone,
        completion_rate: tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0,
      },
      visits: {
        total: visitsTotal,
        visited: visitsDone,
        skipped: Number(result?.visits_skipped ?? 0),
        completion_rate: visitsTotal ? Math.round((visitsDone / visitsTotal) * 100) : 0,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Tasks
  // ───────────────────────────────────────────────────────────────────────────

  async addTask(planId: string, dto: CreatePlanTaskDto, ctx: AuthCtx) {
    const plan = await this.findOne(planId, ctx);
    this.assertOwnsPlan(plan, ctx);

    const task = this.taskRepo.create({
      ...dto,
      plan_id: plan.id,
    });
    return this.taskRepo.save(task);
  }

  async updateTask(taskId: string, dto: UpdatePlanTaskDto, ctx: AuthCtx) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['plan'],
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    this.assertOwnsPlan(task.plan, ctx);

    if (dto.is_done !== undefined && dto.is_done !== task.is_done) {
      task.is_done = dto.is_done;
      task.done_at = dto.is_done ? new Date() : null;
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.order !== undefined) task.order = dto.order;

    return this.taskRepo.save(task);
  }

  async removeTask(taskId: string, ctx: AuthCtx) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['plan'],
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    this.assertOwnsPlan(task.plan, ctx);
    await this.taskRepo.delete(taskId);
    return { message: 'Tarea eliminada' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Visits
  // ───────────────────────────────────────────────────────────────────────────

  async addVisit(planId: string, dto: CreatePlanVisitDto, ctx: AuthCtx) {
    const plan = await this.findOne(planId, ctx);
    this.assertOwnsPlan(plan, ctx);

    let customerName = dto.customer_name;
    let address = dto.address;

    if (dto.customer_id) {
      const customer = await this.customerRepo.findOne({
        where: { id: dto.customer_id, company_id: ctx.companyId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      customerName = customerName || customer.name;
      address = address || customer.address;
    }

    if (!customerName) {
      throw new NotFoundException('Debes enviar customer_id o customer_name');
    }

    const visit = this.visitRepo.create({
      plan_id: plan.id,
      customer_id: dto.customer_id ?? null,
      customer_name: customerName,
      address,
      scheduled_time: dto.scheduled_time ?? null,
      notes: dto.notes,
      order: dto.order ?? 0,
    });
    return this.visitRepo.save(visit);
  }

  async updateVisit(visitId: string, dto: UpdatePlanVisitDto, ctx: AuthCtx) {
    const visit = await this.visitRepo.findOne({
      where: { id: visitId },
      relations: ['plan'],
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    this.assertOwnsPlan(visit.plan, ctx);

    if (dto.customer_id !== undefined) {
      visit.customer_id = dto.customer_id || null;
      if (dto.customer_id) {
        const customer = await this.customerRepo.findOne({
          where: { id: dto.customer_id, company_id: ctx.companyId },
        });
        if (!customer) throw new NotFoundException('Cliente no encontrado');
        if (dto.customer_name === undefined) visit.customer_name = customer.name;
        if (dto.address === undefined) visit.address = customer.address;
      }
    }
    if (dto.customer_name !== undefined) visit.customer_name = dto.customer_name;
    if (dto.address !== undefined) visit.address = dto.address;
    if (dto.scheduled_time !== undefined) visit.scheduled_time = dto.scheduled_time;
    if (dto.status !== undefined) visit.status = dto.status;
    if (dto.notes !== undefined) visit.notes = dto.notes;
    if (dto.order !== undefined) visit.order = dto.order;

    return this.visitRepo.save(visit);
  }

  async removeVisit(visitId: string, ctx: AuthCtx) {
    const visit = await this.visitRepo.findOne({
      where: { id: visitId },
      relations: ['plan'],
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    this.assertOwnsPlan(visit.plan, ctx);
    await this.visitRepo.delete(visitId);
    return { message: 'Visita eliminada' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Determina el user_id objetivo: si el caller pidió el de otro usuario,
   * exige `planner:view_all`. Por defecto: él mismo.
   */
  private resolveTargetUserId(ctx: AuthCtx, requestedUserId?: string) {
    if (!requestedUserId || requestedUserId === ctx.userId) return ctx.userId;
    if (!ctx.permissions.includes(Permission.PLANNER_VIEW_ALL)) {
      throw new ForbiddenException('No tienes permiso para ver planes de otros usuarios');
    }
    return requestedUserId;
  }

  private assertCanAccess(plan: DailyPlan, ctx: AuthCtx) {
    if (plan.company_id !== ctx.companyId) {
      throw new NotFoundException('Plan no encontrado');
    }
    if (plan.user_id !== ctx.userId
        && !ctx.permissions.includes(Permission.PLANNER_VIEW_ALL)) {
      throw new ForbiddenException('No tienes permiso para ver este plan');
    }
  }

  /** Mutar tasks/visits requiere ser el dueño del plan. */
  private assertOwnsPlan(plan: DailyPlan, ctx: AuthCtx) {
    if (plan.user_id !== ctx.userId) {
      throw new ForbiddenException('Solo puedes modificar tu propio plan');
    }
  }
}
