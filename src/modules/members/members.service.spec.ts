import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, ChurchRole } from '../auth/auth.types.js';
import type { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';

const user = (role: ChurchRole): AuthenticatedUser => ({
  userId: 'actor',
  churchId: 'church-1',
  sessionId: 'session-1',
  role,
});

const member = (role: 'OWNER' | 'ADMIN' | 'OPERATOR', id = 'member-2') => ({
  id,
  userId: `user-of-${id}`,
  churchId: 'church-1',
  role,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date(),
  user: { id: `user-of-${id}`, email: `${id}@x.org`, fullName: id },
});

function setup() {
  const repository = {
    withLock: vi.fn((_churchId: string, work: (tx: unknown) => unknown) => work('tx')),
    findActiveMember: vi.fn(),
    countActiveOwners: vi.fn().mockResolvedValue(1),
    updateRole: vi.fn((_c: string, id: string, role: string) => ({ ...member(role as 'OWNER'), id })),
    deactivateMember: vi.fn(),
    listActiveMembers: vi.fn(),
  };
  return { repository, service: new MembersService(repository as unknown as MembersRepository) };
}

describe('MembersService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('no deja degradar al unico dueno (LAST_OWNER), ni a si mismo', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OWNER'));
    await expect(ctx.service.updateRole(user('owner'), 'member-2', 'admin')).rejects.toMatchObject({
      response: { code: 'LAST_OWNER' },
    });
    expect(ctx.repository.updateRole).not.toHaveBeenCalled();
  });

  it('no deja quitar al unico dueno', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OWNER'));
    await expect(ctx.service.remove(user('owner'), 'member-2')).rejects.toMatchObject({
      response: { code: 'LAST_OWNER' },
    });
    expect(ctx.repository.deactivateMember).not.toHaveBeenCalled();
  });

  it('con dos duenos, uno puede degradar al otro', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OWNER'));
    ctx.repository.countActiveOwners.mockResolvedValue(2);
    const result = await ctx.service.updateRole(user('owner'), 'member-2', 'operator');
    expect(result.role).toBe('operator');
  });

  it('un admin no puede tocar a un owner (403)', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OWNER'));
    ctx.repository.countActiveOwners.mockResolvedValue(3);
    await expect(ctx.service.updateRole(user('admin'), 'member-2', 'operator')).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    await expect(ctx.service.remove(user('admin'), 'member-2')).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('un admin no puede asignar owner (403)', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OPERATOR'));
    await expect(ctx.service.updateRole(user('admin'), 'member-2', 'owner')).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('un admin cambia operadores y admins', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OPERATOR'));
    const result = await ctx.service.updateRole(user('admin'), 'member-2', 'admin');
    expect(result.role).toBe('admin');
  });

  it('quitar a alguien desactiva la membresia y cierra sus sesiones de esta iglesia', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(member('OPERATOR'));
    await ctx.service.remove(user('admin'), 'member-2');
    expect(ctx.repository.deactivateMember).toHaveBeenCalledWith(
      'church-1',
      'member-2',
      'user-of-member-2',
      'tx',
    );
  });

  it('un miembro de otra iglesia o inactivo responde 404', async () => {
    ctx.repository.findActiveMember.mockResolvedValue(null);
    await expect(ctx.service.remove(user('owner'), 'x')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});
