// ─────────────────────────────────────────────────────────────────────────────
// RolesController — roles personalizados (custom roles)
// ─────────────────────────────────────────────────────────────────────────────
// Permite crear roles con un set específico de permisos. Cuando un usuario
// tiene `custom_role_id` setteado, sus permisos se calculan desde ese rol
// en vez de los del enum UserRole.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiParam,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/custom-role.dto';
import { FilterRolesDto } from './dto/filter-roles.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentCompany } from '../../common/decorators/user.decorator';
import { Permission } from '../../common/types/enums';
import { Company } from '../companies/entities/company.entity';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, SubscriptionGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({
    summary: 'Listar permisos disponibles',
    description: 'Devuelve todos los permisos que se pueden asignar a un custom role.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ['products:view', 'sales:create', 'reports:export'] },
  })
  getAvailablePermissions() {
    return this.rolesService.getAvailablePermissions();
  }

  @Get()
  @Permissions(Permission.USERS_VIEW)
  @ApiOperation({
    summary: 'Listar custom roles de la empresa (paginado)',
    description: 'Soporta paginación, búsqueda por nombre/descripción y filtro por estado activo. '
      + 'Incluye `users_count` por rol sin disparar N+1.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{
          id: 'uuid', name: 'Vendedor', description: 'Rol de mostrador',
          permissions: ['products:view', 'sales:create'],
          is_active: true, users_count: 3,
        }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrev: false },
      },
    },
  })
  findAll(@CurrentCompany() company: Company, @Query() filters: FilterRolesDto) {
    return this.rolesService.findAll(company.id, filters);
  }

  @Get(':id')
  @Permissions(Permission.USERS_VIEW)
  @ApiOperation({ summary: 'Detalle de un custom role' })
  @ApiParam({ name: 'id', description: 'UUID del rol' })
  findOne(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.rolesService.findOne(id, company.id);
  }

  @Post()
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Crear custom role' })
  @ApiBody({ type: CreateCustomRoleDto })
  @ApiResponse({ status: 201, description: 'Rol creado' })
  create(@Body() dto: CreateCustomRoleDto, @CurrentCompany() company: Company) {
    return this.rolesService.create(dto, company.id);
  }

  @Patch(':id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Actualizar custom role' })
  @ApiParam({ name: 'id', description: 'UUID del rol' })
  @ApiBody({ type: UpdateCustomRoleDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
    @CurrentCompany() company: Company,
  ) {
    return this.rolesService.update(id, dto, company.id);
  }

  @Delete(':id')
  @Permissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Eliminar custom role' })
  @ApiParam({ name: 'id', description: 'UUID del rol' })
  remove(@Param('id') id: string, @CurrentCompany() company: Company) {
    return this.rolesService.remove(id, company.id);
  }
}
