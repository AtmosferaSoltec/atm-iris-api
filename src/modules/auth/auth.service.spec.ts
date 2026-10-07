import { hash } from '@node-rs/argon2';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../config/env.schema.js';
import type { MailPort } from '../../integrations/mail/mail.port.js';
import type { AuthRepository, SessionWithAccount } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
import { ResetCodeService } from './services/reset-code.service.js';
import type { TokenService } from './services/token.service.js';

const ENV: Partial<Env> = {
  REFRESH_TOKEN_SECRET: 'r'.repeat(48),
  REFRESH_TOKEN_IDLE_DAYS: 60,
};
const config = {
  get: (key: keyof Env) => ENV[key],
} as unknown as ConfigService<Env, true>;

const ORIGIN = { ipAddress: '10.0.0.1', userAgent: 'vitest' };
const CLIENT = { platform: 'ios' as const, deviceName: 'iPad de la sala' };

function sessionRow(
  overrides: Partial<SessionWithAccount> = {},
): SessionWithAccount {
  const now = new Date();
  return {
    id: 'session-1',
    userId: 'user-1',
    churchId: 'church-1',
    platform: 'IOS',
    deviceName: 'iPad de la sala',
    refreshGeneration: 3,
    rotatedAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    revokedReason: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    user: {
      id: 'user-1',
      email: 'pastor@vidanueva.org',
      fullName: 'Daniel Ruiz',
      passwordHash: '',
      isActive: true,
      lastLoginAt: null,
      passwordChangedAt: null,
      lastChurchId: 'church-1',
      createdAt: now,
      updatedAt: now,
    },
    church: {
      id: 'church-1',
      name: 'Iglesia Vida Nueva',
      timezone: 'America/Lima',
      bibleEnabled: true,
      multimediaEnabled: true,
      timeControlEnabled: true,
      storageQuotaBytes: 5368709120n,
      syncVersion: 1n,
      createdAt: now,
      updatedAt: now,
    },
    ...overrides,
  };
}

function setup() {
  const repository = {
    findUserByEmail: vi.fn(),
    emailExists: vi.fn(),
    createAccount: vi.fn(),
    findPrimaryMembership: vi.fn(),
    findActiveMemberships: vi.fn().mockResolvedValue([
      { role: 'OWNER', church: { id: 'church-1', name: 'Iglesia Vida Nueva' } },
    ]),
    findMembership: vi
      .fn()
      .mockResolvedValue({ role: 'OWNER', isActive: true }),
    touchLastLogin: vi.fn(),
    createSession: vi.fn(),
    findSession: vi.fn(),
    rotateSession: vi.fn(),
    revokeSession: vi.fn(),
    revokeUserSessions: vi.fn(),
    countResetCodesSince: vi.fn().mockResolvedValue(0),
    createResetCode: vi.fn(),
    findLatestActiveResetCode: vi.fn(),
    incrementResetAttempts: vi.fn(),
    markResetCodeUsed: vi.fn(),
    resetPassword: vi.fn(),
  };
  const tokens = {
    signAccessToken: vi
      .fn()
      .mockResolvedValue({ token: 'access', expiresAt: new Date() }),
  };
  const mail = { sendPasswordResetCode: vi.fn(), sendPasswordChanged: vi.fn() };
  const refreshTokens = new RefreshTokenService(config);
  const resetCodes = new ResetCodeService();

  const service = new AuthService(
    repository as unknown as AuthRepository,
    tokens as unknown as TokenService,
    refreshTokens,
    resetCodes,
    mail as unknown as MailPort,
    config,
  );

  return { service, repository, tokens, mail, refreshTokens, resetCodes };
}

describe('AuthService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  describe('signUp', () => {
    it('rechaza un correo ya registrado con EMAIL_TAKEN', async () => {
      ctx.repository.emailExists.mockResolvedValue(true);

      await expect(
        ctx.service.signUp(
          {
            churchName: 'X',
            fullName: 'Y',
            email: 'a@b.org',
            password: '12345678',
            client: CLIENT,
          },
          ORIGIN,
        ),
      ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
      expect(ctx.repository.createAccount).not.toHaveBeenCalled();
    });

    it('guarda la contrasena hasheada y abre una sesion de 60 dias', async () => {
      ctx.repository.emailExists.mockResolvedValue(false);
      ctx.repository.createAccount.mockResolvedValue({
        user: { id: 'user-1' },
        church: { id: 'church-1' },
      });
      ctx.repository.createSession.mockResolvedValue(
        sessionRow({ refreshGeneration: 0 }),
      );

      const result = await ctx.service.signUp(
        {
          churchName: 'Iglesia',
          fullName: 'Daniel',
          email: 'a@b.org',
          password: '12345678',
          client: CLIENT,
        },
        ORIGIN,
      );

      const { passwordHash } = ctx.repository.createAccount.mock.calls[0]![0];
      expect(passwordHash).not.toBe('12345678');
      expect(passwordHash).toMatch(/^\$argon2/);

      const { expiresAt, platform } =
        ctx.repository.createSession.mock.calls[0]![0];
      const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(60);
      expect(platform).toBe('IOS');

      expect(result.role).toBe('owner');
      expect(ctx.refreshTokens.parse(result.refreshToken)).toEqual({
        sessionId: 'session-1',
        generation: 0,
      });
    });
  });

  describe('signIn', () => {
    it('da el mismo error si el correo no existe o si la contrasena esta mal', async () => {
      ctx.repository.findUserByEmail.mockResolvedValueOnce(null);
      // El `.catch` va al crear cada promesa: entre una y otra hay un `await`
      // (el hash), y una que rechaza sin manejador ese rato la cuenta Node como
      // rechazo sin atender y Vitest termina con error.
      const missing = ctx.service
        .signIn({ email: 'x@y.org', password: 'x', client: CLIENT }, ORIGIN)
        .catch((e) => e);

      ctx.repository.findUserByEmail.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: await hash('la-buena'),
        isActive: true,
      });
      const wrong = ctx.service
        .signIn({ email: 'x@y.org', password: 'la-mala', client: CLIENT }, ORIGIN)
        .catch((e) => e);

      const errors = await Promise.all([missing, wrong]);
      expect(errors[0].getResponse()).toEqual(errors[1].getResponse());
      expect(errors[0].getResponse().code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('refresh', () => {
    it('rota cuando llega la generacion vigente', async () => {
      const session = sessionRow({ refreshGeneration: 3 });
      ctx.repository.findSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce({ ...session, refreshGeneration: 4 });
      ctx.repository.rotateSession.mockResolvedValue(true);

      const result = await ctx.service.refresh(
        ctx.refreshTokens.sign('session-1', 3),
        ORIGIN,
      );

      expect(ctx.repository.rotateSession).toHaveBeenCalledWith(
        'session-1',
        3,
        expect.any(Object),
      );
      expect(ctx.refreshTokens.parse(result.refreshToken)?.generation).toBe(4);
    });

    it('devuelve el token vigente si llega el anterior dentro de la gracia', async () => {
      ctx.repository.findSession.mockResolvedValue(
        sessionRow({ refreshGeneration: 4 }),
      );

      const result = await ctx.service.refresh(
        ctx.refreshTokens.sign('session-1', 3),
        ORIGIN,
      );

      expect(ctx.repository.rotateSession).not.toHaveBeenCalled();
      expect(ctx.repository.revokeSession).not.toHaveBeenCalled();
      expect(ctx.refreshTokens.parse(result.refreshToken)?.generation).toBe(4);
    });

    it('revoca la sesion si el token anterior llega fuera de la gracia', async () => {
      ctx.repository.findSession.mockResolvedValue(
        sessionRow({
          refreshGeneration: 4,
          rotatedAt: new Date(Date.now() - 60_000),
        }),
      );

      await expect(
        ctx.service.refresh(ctx.refreshTokens.sign('session-1', 3), ORIGIN),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });
      expect(ctx.repository.revokeSession).toHaveBeenCalledWith(
        'session-1',
        'TOKEN_REUSE',
      );
    });

    it('revoca la sesion si llega una generacion vieja', async () => {
      ctx.repository.findSession.mockResolvedValue(
        sessionRow({ refreshGeneration: 4 }),
      );

      await expect(
        ctx.service.refresh(ctx.refreshTokens.sign('session-1', 1), ORIGIN),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });
      expect(ctx.repository.revokeSession).toHaveBeenCalledWith(
        'session-1',
        'TOKEN_REUSE',
      );
    });

    it('rechaza sesiones revocadas o caducadas sin tocarlas', async () => {
      ctx.repository.findSession.mockResolvedValueOnce(
        sessionRow({ revokedAt: new Date() }),
      );
      await expect(
        ctx.service.refresh(ctx.refreshTokens.sign('session-1', 3), ORIGIN),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });

      ctx.repository.findSession.mockResolvedValueOnce(
        sessionRow({ expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(
        ctx.service.refresh(ctx.refreshTokens.sign('session-1', 3), ORIGIN),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });

      expect(ctx.repository.rotateSession).not.toHaveBeenCalled();
    });

    it('si otra peticion roto primero, cae en la gracia', async () => {
      const session = sessionRow({ refreshGeneration: 3 });
      ctx.repository.findSession
        .mockResolvedValueOnce(session)
        .mockResolvedValueOnce({ ...session, refreshGeneration: 4 });
      ctx.repository.rotateSession.mockResolvedValue(false);

      const result = await ctx.service.refresh(
        ctx.refreshTokens.sign('session-1', 3),
        ORIGIN,
      );

      expect(ctx.repository.revokeSession).not.toHaveBeenCalled();
      expect(ctx.refreshTokens.parse(result.refreshToken)?.generation).toBe(4);
    });
  });

  describe('recuperacion', () => {
    const user = {
      id: 'user-1',
      email: 'pastor@vidanueva.org',
      fullName: 'Daniel Ruiz',
      isActive: true,
    };

    it('no hace nada ni lo delata si el correo no existe', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(null);

      await expect(
        ctx.service.requestPasswordReset('nadie@x.org'),
      ).resolves.toBeUndefined();
      expect(ctx.mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('no envia mas de 3 codigos al dia', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(user);
      ctx.repository.countResetCodesSince.mockResolvedValue(3);

      await ctx.service.requestPasswordReset(user.email);
      expect(ctx.mail.sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('un fallo del proveedor de correo no cambia la respuesta', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(user);
      ctx.mail.sendPasswordResetCode.mockRejectedValue(
        new Error('Resend caido'),
      );

      await expect(
        ctx.service.requestPasswordReset(user.email),
      ).resolves.toBeUndefined();
    });

    it('envia un codigo de 6 digitos y guarda solo su hash', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(user);

      await ctx.service.requestPasswordReset(user.email);

      const { code } = ctx.mail.sendPasswordResetCode.mock.calls[0]![0];
      const [, codeHash] = ctx.repository.createResetCode.mock.calls[0]!;
      expect(code).toMatch(/^\d{6}$/);
      expect(codeHash).not.toContain(code);
      await expect(ctx.resetCodes.matches(code, codeHash)).resolves.toBe(true);
    });

    it('cuenta los intentos fallidos y quema el codigo al llegar a 5', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(user);
      ctx.repository.findLatestActiveResetCode.mockResolvedValueOnce({
        id: 'code-1',
        codeHash: await hash('123456'),
        verificationAttempts: 0,
      });

      await expect(
        ctx.service.verifyResetCode({ email: user.email, code: '000000' }),
      ).rejects.toMatchObject({ response: { code: 'RESET_CODE_INVALID' } });
      expect(ctx.repository.incrementResetAttempts).toHaveBeenCalledWith(
        'code-1',
      );

      ctx.repository.findLatestActiveResetCode.mockResolvedValueOnce({
        id: 'code-1',
        codeHash: await hash('123456'),
        verificationAttempts: 5,
      });
      await expect(
        ctx.service.verifyResetCode({ email: user.email, code: '123456' }),
      ).rejects.toMatchObject({ response: { code: 'RESET_LIMIT_REACHED' } });
      expect(ctx.repository.markResetCodeUsed).toHaveBeenCalledWith('code-1');
    });

    it('al restablecer cambia la contrasena, cierra sesiones y avisa por correo', async () => {
      ctx.repository.findUserByEmail.mockResolvedValue(user);
      ctx.repository.findLatestActiveResetCode.mockResolvedValue({
        id: 'code-1',
        codeHash: await hash('123456'),
        verificationAttempts: 0,
      });

      await ctx.service.resetPassword({
        email: user.email,
        code: '123456',
        password: 'nuevaclave123',
        passwordConfirmation: 'nuevaclave123',
      });

      const [userId, passwordHash] =
        ctx.repository.resetPassword.mock.calls[0]!;
      expect(userId).toBe('user-1');
      expect(passwordHash).toMatch(/^\$argon2/);
      expect(ctx.mail.sendPasswordChanged).toHaveBeenCalledWith({
        to: user.email,
        fullName: user.fullName,
      });
    });
  });
});
