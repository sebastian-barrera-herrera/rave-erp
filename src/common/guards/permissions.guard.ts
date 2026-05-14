import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission, ROLE_PERMISSIONS, UserRole } from '../types/enums';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('No autenticado');

    // ADMIN always has full access
    if (user.role === UserRole.ADMIN) return true;

    // If user has a custom role with explicit permissions list, use that
    let userPermissions: string[] = [];

    if (user.custom_permissions && user.custom_permissions.length > 0) {
      userPermissions = user.custom_permissions;
    } else {
      // Fall back to built-in role permissions
      userPermissions = ROLE_PERMISSIONS[user.role as UserRole] || [];
    }

    const hasAll = required.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      throw new ForbiddenException(
        `No tienes permiso para realizar esta acción. Permisos requeridos: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
