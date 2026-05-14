// ─────────────────────────────────────────────────────────────────────────────
// UsersController — gestión de usuarios internos de la empresa
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: literal routes (e.g. /invitations) MUST be declared BEFORE any
// `:id` route, otherwise Express matches `:id = "invitations"` and the UUID
// param validation fails with "invalid input syntax for type uuid".
// ─────────────────────────────────────────────────────────────────────────────
import type { Response } from 'express';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Res,
  UploadedFile, UseGuards, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiConsumes,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserDocumentsService } from './user-documents.service';
import { CreateUserDto, UpdateUserDto, UpdateMyProfileDto, FilterUsersDto } from './dto/user.dto';
import { UploadUserDocumentDto } from './dto/user-document.dto';
import { EmploymentCertificateDto } from '../customers/dto/customer.dto';
import { InviteUserDto } from '../auth/dto/invitation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany, CurrentUser } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userDocsService: UserDocumentsService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Invitaciones (declaradas ARRIBA para no chocar con :id)
  // ───────────────────────────────────────────────────────────────────────────

  @Post('invite')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({
    summary: 'Invitar a un nuevo miembro a la empresa',
    description:
      'Genera una invitación pendiente y envía un correo al `email` con un link '
      + 'que lleva al frontend para que el invitado fije su contraseña. '
      + 'Si ya hay una invitación pendiente para ese email se rota el token y '
      + 'se reenvía el correo. El link expira en 7 días.',
  })
  @ApiBody({ type: InviteUserDto })
  @ApiResponse({ status: 201, description: 'Invitación creada y correo enviado' })
  @ApiResponse({ status: 409, description: 'El email ya pertenece a un usuario de la empresa' })
  invite(
    @Body() dto: InviteUserDto,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.usersService.invite(dto, company.id, user.id);
  }

  @Get('invitations')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Listar invitaciones de la empresa (pendientes y aceptadas)' })
  listInvitations(@CurrentCompany() company: Company) {
    return this.usersService.listInvitations(company.id);
  }

  @Post('invitations/:id/resend')
  @Permissions(Permission.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar invitación (rota el token y emite uno nuevo)' })
  @ApiParam({ name: 'id', description: 'UUID de la invitación' })
  resendInvitation(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    return this.usersService.resendInvitation(id, company.id, user.id);
  }

  @Delete('invitations/:id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Revocar invitación pendiente' })
  @ApiParam({ name: 'id', description: 'UUID de la invitación' })
  revokeInvitation(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.usersService.revokeInvitation(id, company.id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD de usuarios
  // ───────────────────────────────────────────────────────────────────────────

  @Get()
  @Permissions(Permission.USERS_VIEW)
  @ApiOperation({ summary: 'Listar usuarios de la empresa (paginado)' })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterUsersDto) {
    return this.usersService.findAll(company.id, filters);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Self-update del perfil (cualquier usuario autenticado)
  // ───────────────────────────────────────────────────────────────────────────
  // No requiere `users:manage`; el usuario solo puede tocar SUS campos.
  // Cambiar role/permisos/activación va por PATCH /users/:id (admin).
  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar mi propio perfil',
    description:
      'Cualquier usuario autenticado puede actualizar su nombre, foto, teléfono, '
      + 'cédula y dirección. Cambios de rol o estado SIEMPRE pasan por el '
      + 'endpoint con permiso `users:manage`.',
  })
  @ApiBody({ type: UpdateMyProfileDto })
  updateMyProfile(
    @CurrentUser() user: any,
    @CurrentCompany() company: Company,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.id, company.id, dto);
  }

  @Post()
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({
    summary: 'Crear usuario',
    description: 'Crea un usuario nuevo en la empresa autenticada con un rol predefinido o custom.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 400, description: 'Email ya registrado' })
  create(@Body() dto: CreateUserDto, @CurrentCompany() company: Company) {
    return this.usersService.create(dto, company.id);
  }

  @Get(':id')
  @Permissions(Permission.USERS_VIEW)
  @ApiOperation({ summary: 'Detalle de un usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.usersService.findOne(id, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Actualizar usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiBody({ type: UpdateUserDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentCompany() company: Company,
  ) {
    return this.usersService.update(id, dto, company.id);
  }

  @Delete(':id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Eliminar usuario (soft delete)' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.usersService.remove(id, company.id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Documentos del miembro (incapacidades, afiliaciones, contratos, etc.)
  // ───────────────────────────────────────────────────────────────────────────
  // Cada miembro puede gestionar SUS PROPIOS documentos. Para tocar los de
  // otro miembro se necesita `users:manage`.
  // ───────────────────────────────────────────────────────────────────────────

  @Get(':id/documents')
  @ApiOperation({
    summary: 'Listar documentos del miembro',
    description:
      'Sin metadatos del binario — para descargarlos usa `/users/documents/:docId/download`. '
      + 'Cualquier usuario autenticado puede listar SUS propios documentos. Para ver los '
      + 'de otro miembro se requiere `users:manage`.',
  })
  @ApiParam({ name: 'id', description: 'UUID del miembro' })
  listDocuments(
    @Param('id') id: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    const canManage = (user.custom_permissions ?? []).includes(Permission.USERS_MANAGE);
    return this.userDocsService.list(id, company.id, user.id, canManage);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir un documento al miembro',
    description:
      'PDF o imagen (PNG/JPG/WEBP). Máximo 8 MB. El campo `file` viaja como '
      + 'multipart, el resto como campos de formulario.',
  })
  @ApiParam({ name: 'id', description: 'UUID del miembro destino' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type', 'title'],
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string', enum: ['MEDICAL_LEAVE','AFFILIATION','ID','CONTRACT','TRAINING','OTHER'] },
        title: { type: 'string', example: 'Incapacidad médica – 3 días' },
        description: { type: 'string' },
        issued_at: { type: 'string', format: 'date' },
        expires_at: { type: 'string', format: 'date' },
      },
    },
  })
  uploadDocument(
    @Param('id') id: string,
    @Body() dto: UploadUserDocumentDto,
    @UploadedFile() file: any,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    const canManage = (user.custom_permissions ?? []).includes(Permission.USERS_MANAGE);
    return this.userDocsService.upload(
      id, company.id, user.id, dto, file, canManage,
    );
  }

  @Get('documents/:docId/download')
  @ApiOperation({ summary: 'Descargar el binario de un documento' })
  @ApiParam({ name: 'docId', description: 'UUID del documento' })
  async downloadDocument(
    @Param('docId') docId: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const canManage = (user.custom_permissions ?? []).includes(Permission.USERS_MANAGE);
    const doc = await this.userDocsService.download(
      docId, company.id, user.id, canManage,
    );
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${doc.file_name.replace(/"/g, '')}"`,
    );
    res.end(doc.data);
  }

  @Delete('documents/:docId')
  @ApiOperation({ summary: 'Eliminar un documento (soft delete)' })
  @ApiParam({ name: 'docId', description: 'UUID del documento' })
  removeDocument(
    @Param('docId') docId: string,
    @CurrentCompany() company: Company,
    @CurrentUser() user: any,
  ) {
    const canManage = (user.custom_permissions ?? []).includes(Permission.USERS_MANAGE);
    return this.userDocsService.remove(docId, company.id, user.id, canManage);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Certificado laboral del miembro
  // ───────────────────────────────────────────────────────────────────────────
  @Post(':id/employment-certificate')
  @Permissions(Permission.USERS_VIEW)
  @ApiOperation({
    summary: 'Generar certificación laboral PDF para el miembro del equipo',
  })
  @ApiParam({ name: 'id', description: 'UUID del miembro' })
  @ApiBody({ type: EmploymentCertificateDto })
  async employmentCertificate(
    @Param('id') id: string,
    @Body() dto: EmploymentCertificateDto,
    @CurrentCompany() company: Company,
    @Res() res: Response,
  ) {
    const { pdf, user } = await this.userDocsService.generateEmploymentCertificate(
      id, company.id, dto,
    );
    const safe = user.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificado-laboral-${safe}.pdf"`,
    );
    res.end(pdf);
  }
}
