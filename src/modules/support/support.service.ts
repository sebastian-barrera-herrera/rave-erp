import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketMessage } from './entities/ticket-message.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import {
  CreateTicketDto, UpdateTicketDto, AddMessageDto, FilterTicketsDto,
} from './dto/support.dto';
import { TicketStatus, TicketPriority, UserRole } from '../../common/types/enums';
import { paginate } from '../../common/types/pagination.type';
import { MailService } from '../../shared/services/mail.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(TicketMessage)
    private readonly messageRepo: Repository<TicketMessage>,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateTicketDto, companyId: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      const company = await manager.findOne(Company, { where: { id: companyId } });
      const ticketNumber = await this.generateTicketNumber(manager, companyId);
      const priority = dto.priority ?? TicketPriority.MEDIUM;

      const ticket = manager.create(SupportTicket, {
        user_id: userId,
        ticket_number: ticketNumber,
        type: dto.type,
        status: TicketStatus.OPEN,
        priority,
        subject: dto.subject,
      });
      ticket.company_id = companyId;

      await manager.save(ticket);

      const message = manager.create(TicketMessage, {
        ticket_id: ticket.id,
        user_id: userId,
        message: dto.message,
        is_staff_reply: false,
      });

      await manager.save(message);

      // Notify user via email if they have email
      if (user?.email) {
        this.mailService.sendTicketConfirmation(
          user.email,
          user.name,
          ticketNumber,
          dto.type,
          dto.subject,
        ).catch((err) => this.logger.error(`Email ticket confirmation failed: ${err.message}`));
      }

      // Notificar al dueño de la plataforma para que pueda actuar rápido.
      this.mailService.sendTicketAlertToOwner({
        ticketNumber,
        type: dto.type,
        priority,
        subject: dto.subject,
        message: dto.message,
        companyName: company?.name ?? 'Empresa desconocida',
        userName: user?.name ?? 'Usuario desconocido',
        userEmail: user?.email ?? 'sin-email',
      }).catch((err) => this.logger.error(`Email ticket owner alert failed: ${err.message}`));

      return manager.findOne(SupportTicket, {
        where: { id: ticket.id },
        relations: ['user', 'messages', 'messages.user'],
      });
    });
  }

  async findAll(companyId: string, filters: FilterTicketsDto, userId: string, userRole: string) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'u')
      .where('t.company_id = :companyId', { companyId });

    // Non-admins/managers only see their own tickets
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      qb.andWhere('t.user_id = :userId', { userId });
    }

    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters.priority) qb.andWhere('t.priority = :priority', { priority: filters.priority });
    if (filters.search) {
      qb.andWhere(
        '(t.subject ILIKE :s OR t.ticket_number ILIKE :s)',
        { s: `%${filters.search}%` },
      );
    }
    if (filters.date_from) qb.andWhere('t.created_at >= :from', { from: new Date(filters.date_from) });
    if (filters.date_to) qb.andWhere('t.created_at <= :to', { to: new Date(filters.date_to) });

    qb.skip(skip).take(limit).orderBy('t.created_at', 'DESC');
    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, companyId: string, userId: string, userRole: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['user', 'messages', 'messages.user'],
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    // Non-admins/managers can only view their own tickets
    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      ticket.user_id !== userId
    ) {
      throw new ForbiddenException('No tienes permiso para ver este ticket');
    }

    // Sort messages chronologically
    if (ticket.messages) {
      ticket.messages.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    return ticket;
  }

  async updateStatus(id: string, dto: UpdateTicketDto, companyId: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['user'],
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    if (dto.status) ticket.status = dto.status;
    if (dto.priority) ticket.priority = dto.priority;

    if (dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED) {
      ticket.resolved_at = new Date();
    }

    await this.ticketRepo.save(ticket);
    return ticket;
  }

  async addMessage(id: string, dto: AddMessageDto, companyId: string, userId: string, userRole: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id, company_id: companyId },
      relations: ['user'],
    });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    if (ticket.status === TicketStatus.CLOSED) {
      throw new ForbiddenException('No se pueden agregar mensajes a un ticket cerrado');
    }

    // Non-admins/managers can only reply to their own tickets
    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      ticket.user_id !== userId
    ) {
      throw new ForbiddenException('No tienes permiso para responder este ticket');
    }

    const isStaff = userRole === UserRole.ADMIN || userRole === UserRole.MANAGER;

    const message = this.messageRepo.create({
      ticket_id: id,
      user_id: userId,
      message: dto.message,
      is_staff_reply: isStaff,
    });

    await this.messageRepo.save(message);

    // Reopen ticket if it was resolved and user replies
    if (!isStaff && ticket.status === TicketStatus.RESOLVED) {
      await this.ticketRepo.update(id, { status: TicketStatus.OPEN, resolved_at: null as unknown as Date });
    }

    // Move to IN_PROGRESS when staff first replies
    if (isStaff && ticket.status === TicketStatus.OPEN) {
      await this.ticketRepo.update(id, { status: TicketStatus.IN_PROGRESS });
    }

    // Notify ticket owner if staff replies
    if (isStaff && ticket.user?.email) {
      this.mailService.sendTicketReply(
        ticket.user.email,
        ticket.user.name,
        ticket.ticket_number,
        ticket.subject,
        dto.message,
      ).catch((err) => this.logger.error(`Email ticket reply failed: ${err.message}`));
    }

    return message;
  }

  async getStats(companyId: string) {
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status');

    const byStatus = await qb.getRawMany();

    const byType = await this.ticketRepo
      .createQueryBuilder('t')
      .where('t.company_id = :companyId', { companyId })
      .select('t.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.type')
      .getRawMany();

    return { byStatus, byType };
  }

  private async generateTicketNumber(manager: any, companyId: string): Promise<string> {
    const count = await manager.count(SupportTicket, { where: { company_id: companyId } });
    const year = new Date().getFullYear();
    return `TKT-${year}-${String(count + 1).padStart(6, '0')}`;
  }
}
