import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type {
  ClientPlatform,
  MemberRole,
  SessionRevokedReason,
} from '../../generated/prisma/client.js';

export type NewAccount = {
  churchName: string;
  fullName: string;
  email: string;
  passwordHash: string;
};

export type NewSession = {
  userId: string;
  churchId: string;
  platform: ClientPlatform;
  deviceName: string | null;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

const ACCOUNT_INCLUDE = {
  user: true,
  church: true,
} as const;

/**
 * Unico punto del modulo que toca Prisma. El servicio decide; este archivo solo
 * lee y escribe, asi las reglas se prueban con este repositorio doblado.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* --------------------------------------------------------------- Usuarios */

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  /** Iglesia, usuario y membresia de dueno, todo o nada. */
  createAccount(account: NewAccount) {
    return this.prisma.$transaction(async (tx) => {
      const church = await tx.church.create({
        data: { name: account.churchName },
      });
      const user = await tx.user.create({
        data: {
          email: account.email,
          fullName: account.fullName,
          passwordHash: account.passwordHash,
          lastLoginAt: new Date(),
          lastChurchId: church.id,
        },
      });
      await tx.churchMember.create({
        data: { churchId: church.id, userId: user.id, role: 'OWNER' },
      });

      return { user, church, role: 'OWNER' as MemberRole };
    });
  }

  /**
   * La membresia con la que se entra al iniciar sesion: la de la ultima iglesia
   * usada si sigue activa; si no, la activa mas antigua.
   */
  async findPrimaryMembership(userId: string, lastChurchId: string | null) {
    if (lastChurchId) {
      const last = await this.prisma.churchMember.findFirst({
        where: { userId, churchId: lastChurchId, isActive: true },
      });
      if (last) return last;
    }

    return this.prisma.churchMember.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Membresias activas con el nombre de la iglesia, para `churches` de la sesion. */
  findActiveMemberships(userId: string) {
    return this.prisma.churchMember.findMany({
      where: { userId, isActive: true },
      select: { role: true, church: { select: { id: true, name: true } } },
    });
  }

  findMembership(userId: string, churchId: string) {
    return this.prisma.churchMember.findUnique({
      where: { churchId_userId: { churchId, userId } },
    });
  }

  /** Marca el login y recuerda la iglesia para el proximo `sign-in`. */
  async touchLastLogin(userId: string, churchId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastChurchId: churchId },
    });
  }

  async updateFullName(userId: string, fullName: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fullName },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /* --------------------------------------------------------------- Sesiones */

  createSession(session: NewSession) {
    return this.prisma.session.create({
      data: session,
      include: ACCOUNT_INCLUDE,
    });
  }

  findSession(id: string) {
    return this.prisma.session.findUnique({
      where: { id },
      include: ACCOUNT_INCLUDE,
    });
  }

  /**
   * Lo que el guard comprueba en cada peticion, en una sola consulta: la sesion
   * viva (no revocada, sin caducar), apuntando a la iglesia del token, con el
   * usuario activo y su membresia activa en esa iglesia. Devuelve el rol
   * vigente o null.
   *
   * El rol se lee de la base y no del token: asi quitar o degradar a alguien
   * corta su acceso en el acto, no a los 15 minutos.
   */
  async findActiveSessionRole(
    sessionId: string,
    churchId: string,
  ): Promise<MemberRole | null> {
    const rows = await this.prisma.$queryRaw<{ role: MemberRole }[]>`
      SELECT m.role::text AS role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN church_members m ON m.church_id = s.church_id AND m.user_id = s.user_id
      WHERE s.id = ${sessionId}
        AND s.church_id = ${churchId}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.is_active
        AND m.is_active
    `;

    return rows[0]?.role ?? null;
  }

  /**
   * Avanza la generacion solo si sigue siendo `fromGeneration`. Si dos
   * peticiones rotan a la vez, una sola gana (devuelve `true`); la otra ve
   * `false` y la trata como el token anterior dentro de la gracia.
   */
  async rotateSession(
    id: string,
    fromGeneration: number,
    update: {
      expiresAt: Date;
      ipAddress: string | null;
      userAgent: string | null;
    },
  ): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.session.updateMany({
      where: { id, refreshGeneration: fromGeneration, revokedAt: null },
      data: {
        refreshGeneration: { increment: 1 },
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: update.expiresAt,
        ...(update.ipAddress ? { ipAddress: update.ipAddress } : {}),
        ...(update.userAgent ? { userAgent: update.userAgent } : {}),
      },
    });

    return count === 1;
  }

  async revokeSession(id: string, reason: SessionRevokedReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeUserSessions(
    userId: string,
    reason: SessionRevokedReason,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Solo sesiones del usuario: la de otro responde como si no existiera. */
  async revokeOwnSession(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'SIGN_OUT' },
    });
    return count === 1;
  }

  /** Sesiones abiertas del usuario en todas sus iglesias, la mas reciente primero. */
  listActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * Lleva la sesion a otra iglesia y rota el refresh token en el mismo paso:
   * el par anterior apuntaba a la iglesia vieja y deja de servir.
   */
  async switchSessionChurch(
    sessionId: string,
    userId: string,
    churchId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: {
          churchId,
          refreshGeneration: { increment: 1 },
          rotatedAt: now,
          lastUsedAt: now,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { lastChurchId: churchId },
      }),
    ]);
  }

  /**
   * Cambio de contrasena desde la sesion: guarda el hash, quema los codigos de
   * recuperacion vigentes y cierra las **demas** sesiones. La actual sigue.
   */
  async changePassword(
    userId: string,
    passwordHash: string,
    keepSessionId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      }),
      this.prisma.passwordResetCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: keepSessionId } },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      }),
    ]);
  }

  /* -------------------------------------------------- Recuperacion de acceso */

  countResetCodesSince(userId: string, since: Date): Promise<number> {
    return this.prisma.passwordResetCode.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  async createResetCode(
    userId: string,
    codeHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.passwordResetCode.create({
      data: { userId, codeHash, expiresAt },
    });
  }

  /** El ultimo codigo pedido que no se uso ni vencio. Los anteriores no cuentan. */
  findLatestActiveResetCode(userId: string) {
    return this.prisma.passwordResetCode.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementResetAttempts(id: string): Promise<void> {
    await this.prisma.passwordResetCode.update({
      where: { id },
      data: { verificationAttempts: { increment: 1 } },
    });
  }

  async markResetCodeUsed(id: string): Promise<void> {
    await this.prisma.passwordResetCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Cambia la contrasena, quema todos los codigos vigentes y cierra todas las
   * sesiones, en una sola transaccion: quien restablece espera que nadie mas
   * siga dentro, y no puede quedar a medias.
   */
  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: now },
      }),
      this.prisma.passwordResetCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      }),
    ]);
  }
}

export type SessionWithAccount = NonNullable<
  Awaited<ReturnType<AuthRepository['findSession']>>
>;
