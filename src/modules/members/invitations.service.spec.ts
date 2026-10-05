import type { ConfigService } from '@nestjs/config';
import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../config/env.schema.js';
import type { MailPort } from '../../integrations/mail/mail.port.js';
import type { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { hashToken, InvitationsService } from './invitations.service.js';
import type { MembersRepository } from './members.repository.js';

const owner: AuthenticatedUser = {
  userId: 'owner-1',
  churchId: 'church-1',
  sessionId: 's-1',
  role: 'owner',
};

const invitationRow = (overrides = {}) => ({
  id: 'inv-1',
  churchId: 'church-1',
  email: 'nueva@x.org',
  role: 'OPERATOR' as const,
  tokenHash: 'h',
  invitedByUserId: 'owner-1',
  expiresAt: new Date(Date.now() + 86_400_000),
  acceptedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  invitedBy: { id: 'owner-1', fullName: 'Daniel Ruiz' },
  church: { id: 'church-1', name: 'Iglesia Vida Nueva' },
  ...overrides,
});

function setup() {
  const repository = {
    isActiveMemberEmail: vi.fn().mockResolvedValue(false),
    createInvitation: vi.fn().mockResolvedValue(invitationRow()),
    findChurch: vi.fn().mockResolvedValue({ id: 'church-1', name: 'Iglesia Vida Nueva', timezone: 'America/Lima' }),
    findPendingInvitationByTokenHash: vi.fn(),
    findUserByEmail: vi.fn(),
    findMembership: vi.fn(),
    acceptInvitation: vi.fn().mockResolvedValue('user-9'),
  };
  const mail = { sendInvitation: vi.fn() };
  const auth = { openSession: vi.fn().mockResolvedValue({ role: 'operator' }) };
  const config = { get: () => 'http://localhost:3000' } as unknown as ConfigService<Env, true>;
  const service = new InvitationsService(
    repository as unknown as MembersRepository,
    auth as unknown as AuthService,
    mail as unknown as MailPort,
    config,
  );
  return { repository, mail, auth, service };
}

describe('InvitationsService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('rechaza invitar a quien ya es miembro activo (ALREADY_MEMBER)', async () => {
    ctx.repository.isActiveMemberEmail.mockResolvedValue(true);
    await expect(
      ctx.service.create(owner, { email: 'ya@x.org', role: 'operator' }),
    ).rejects.toMatchObject({ response: { code: 'ALREADY_MEMBER' } });
    expect(ctx.repository.createInvitation).not.toHaveBeenCalled();
  });

  it('guarda solo el hash del token y manda el enlace con el token', async () => {
    await ctx.service.create(owner, { email: 'nueva@x.org', role: 'operator' });
    const { tokenHash } = ctx.repository.createInvitation.mock.calls[0]![1];
    const { acceptUrl, roleLabel } = ctx.mail.sendInvitation.mock.calls[0]![0];
    const token = new URL(acceptUrl).searchParams.get('token')!;

    expect(acceptUrl).toMatch(/^http:\/\/localhost:3000\/invitacion\?token=/);
    expect(token).toHaveLength(43); // 32 bytes en base64url
    expect(tokenHash).toBe(hashToken(token));
    expect(roleLabel).toBe('Operador');
  });

  it('un fallo del correo no impide crear la invitacion', async () => {
    ctx.mail.sendInvitation.mockRejectedValue(new Error('Resend caido'));
    await expect(
      ctx.service.create(owner, { email: 'nueva@x.org', role: 'operator' }),
    ).resolves.toMatchObject({ id: 'inv-1' });
  });

  it('un admin no puede invitar owners', async () => {
    await expect(
      ctx.service.create({ ...owner, role: 'admin' }, { email: 'a@x.org', role: 'owner' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('token vencido, usado o inexistente → INVITATION_INVALID', async () => {
    ctx.repository.findPendingInvitationByTokenHash.mockResolvedValue(null);
    await expect(ctx.service.lookup('x')).rejects.toMatchObject({
      response: { code: 'INVITATION_INVALID' },
    });
  });

  it('cuenta existente: exige su contrasena', async () => {
    ctx.repository.findPendingInvitationByTokenHash.mockResolvedValue(invitationRow());
    ctx.repository.findUserByEmail.mockResolvedValue({
      id: 'user-9',
      isActive: true,
      passwordHash: await hash('la-buena-123'),
    });
    const client = { platform: 'web' as const };

    await expect(
      ctx.service.accept({ token: 't', password: 'la-mala-123', client }, {}),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    await ctx.service.accept({ token: 't', password: 'la-buena-123', client }, {});
    expect(ctx.repository.acceptInvitation).toHaveBeenCalledWith(
      'church-1',
      'inv-1',
      'OPERATOR',
      { userId: 'user-9' },
    );
    expect(ctx.auth.openSession).toHaveBeenCalledWith('user-9', 'church-1', client, {});
  });

  it('cuenta nueva: exige nombre y contrasena de 8+', async () => {
    ctx.repository.findPendingInvitationByTokenHash.mockResolvedValue(invitationRow());
    ctx.repository.findUserByEmail.mockResolvedValue(null);
    await expect(
      ctx.service.accept({ token: 't', password: 'corta', client: { platform: 'ios' } }, {}),
    ).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', errors: { fullName: expect.any(String), password: expect.any(String) } },
    });
  });
});
