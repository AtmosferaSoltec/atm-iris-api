import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { ChurchRole } from '../../modules/auth/auth.types.js';
import type { Permission } from '../constants/permissions.js';
import { REQUEST_USER_KEY } from '../decorators/current-user.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';

function contextFor(role: ChurchRole | null, required: Permission[] | undefined) {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const request = role ? { [REQUEST_USER_KEY]: { role } } : {};
  const context = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), context };
}

describe('PermissionsGuard', () => {
  it('deja pasar si el endpoint no exige permisos', () => {
    const { guard, context } = contextFor('operator', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('deja pasar al rol que tiene el permiso', () => {
    const { guard, context } = contextFor('admin', ['members.manage']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('responde 403 FORBIDDEN al rol que no lo tiene', () => {
    const { guard, context } = contextFor('operator', ['members.manage']);
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'FORBIDDEN' }) }),
    );
  });

  it('exige todos los permisos indicados', () => {
    const { guard, context } = contextFor('operator', ['people.manage', 'records.manage']);
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('sin usuario en el request, 403', () => {
    const { guard, context } = contextFor(null, ['people.manage']);
    expect(() => guard.canActivate(context)).toThrow();
  });
});
