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
        },
      });
      await tx.churchMember.create({
        data: { churchId: church.id, userId: user.id, role: 'OWNER' },
      });

      return { user, church, role: 'OWNER' as MemberRole };
    });
  }

  /**
   * La membresia con la que se entra al iniciar sesion: la activa mas antigua.
   * Elegir entre varias iglesias llega con las invitaciones.
   */
  findPrimaryMembership(userId: string) {
    return this.prisma.churchMember.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { church: true },
    });
  }

  findMembership(userId: string, churchId: string) {
    return this.prisma.churchMember.findUnique({
      where: { churchId_userId: { churchId, userId } },
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
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
   * Viva = no revocada y sin caducar por inactividad. La consulta el guard en
   * cada peticion, por eso es una lectura por clave primaria y nada mas.
   */
  async isSessionActive(id: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: { revokedAt: true, expiresAt: true },
    });

    return Boolean(
      session && !session.revokedAt && session.expiresAt > new Date(),
    );
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
