import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.types.js';
import { API_ERROR_CODES } from '../constants/error-codes.js';
import { hasPermission, type Permission } from '../constants/permissions.js';
import { REQUEST_USER_KEY } from '../decorators/current-user.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';

/**
 * Comprueba `@RequirePermissions` contra el rol de la sesion.
 *
 * Corre despues de `JwtAuthGuard`, que deja el usuario en el request. Sin
 * permisos declarados no exige nada: leer es libre para cualquier miembro.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request[REQUEST_USER_KEY as keyof Request] as
      | AuthenticatedUser
      | undefined;

    if (user && required.every((p) => hasPermission(user.role, p))) {
      return true;
    }

    throw new ForbiddenException({
      code: API_ERROR_CODES.FORBIDDEN,
      message: 'No tienes permiso para hacer esto.',
    });
  }
}
