import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.types.js';

export const REQUEST_USER_KEY = 'irisUser';

/** La sesion del request, ya validada por `JwtAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();

    return request[REQUEST_USER_KEY as keyof Request] as AuthenticatedUser;
  },
);
