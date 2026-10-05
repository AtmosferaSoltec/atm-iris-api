import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.types.js';
import { AuthRepository } from '../../modules/auth/auth.repository.js';
import { TokenService } from '../../modules/auth/services/token.service.js';
import { API_ERROR_CODES } from '../constants/error-codes.js';
import { REQUEST_USER_KEY } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Valida el access token del header `Authorization` y deja la sesion en el
 * request.
 *
 * Es global: todo esta protegido salvo lo que se marque con `@Public()`.
 *
 * Ademas de la firma, comprueba que la sesion siga viva. Es una consulta por
 * clave primaria y es lo que hace que cerrar sesion —o restablecer la
 * contrasena— corte el acceso en el acto y no a los 15 minutos.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly repository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw this.unauthorized();

    const payload = await this.tokens.verifyAccessToken(token);
    if (!payload) throw this.unauthorized();

    const isActive = await this.repository.isSessionActive(payload.sid);
    if (!isActive) throw this.unauthorized();

    const user: AuthenticatedUser = {
      userId: payload.sub,
      churchId: payload.churchId,
      sessionId: payload.sid,
      role: payload.role,
    };
    Object.assign(request, { [REQUEST_USER_KEY]: user });

    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    });
  }
}
