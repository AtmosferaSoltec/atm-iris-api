import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { MemberRole } from '../../generated/prisma/client.js';

type Db = PrismaService | Tx;

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true } },
} as const;

const INVITATION_INCLUDE = {
  invitedBy: { select: { id: true, fullName: true } },
} as const;

/** Pendiente = ni aceptada ni revocada. Puede estar vencida. */
const PENDING = { acceptedAt: null, revokedAt: null } as const;

export type NewInvitation = {
  email: string;
  role: MemberRole;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
};

export type NewInvitedUser = {
  email: string;
  fullName: string;
  passwordHash: string;
};

/**
 * Equipo e invitaciones. `churchId` va siempre primero: es lo unico que el
 * compilador puede verificar contra olvidarse de filtrar por iglesia.
 *
 * Los metodos que participan de una regla con carrera (no dejar la iglesia sin
 * dueno) aceptan la transaccion de `withLock` como ultimo parametro.
 */
@Injectable()
export class MembersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  /** Serializa los cambios de equipo de la iglesia (ver ChurchWriteLock). */
  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  /* ---------------------------------------------------------------- Miembros */

  listActiveMembers(churchId: string) {
    return this.prisma.churchMember.findMany({
      where: { churchId, isActive: true },
      include: MEMBER_INCLUDE,
    });
  }

  findActiveMember(churchId: string, memberId: string, db: Db = this.prisma) {
    return db.churchMember.findFirst({
      where: { id: memberId, churchId, isActive: true },
      include: MEMBER_INCLUDE,
    });
  }

  countActiveOwners(churchId: string, db: Db = this.prisma): Promise<number> {
    return db.churchMember.count({
      where: { churchId, isActive: true, role: 'OWNER', user: { isActive: true } },
    });
  }

  updateRole(
    churchId: string,
    memberId: string,
    role: MemberRole,
    db: Db = this.prisma,
  ) {
    return db.churchMember.update({
      where: { id: memberId, churchId },
      data: { role },
      include: MEMBER_INCLUDE,
    });
  }

  /**
   * Desactiva la membresia y cierra las sesiones de esa persona abiertas en
   * esta iglesia. Las que tenga en otras iglesias siguen.
   */
  async deactivateMember(
    churchId: string,
    memberId: string,
    userId: string,
    db: Db = this.prisma,
  ): Promise<void> {
    await db.churchMember.update({
      where: { id: memberId, churchId },
      data: { isActive: false },
    });
    await db.session.updateMany({
      where: { churchId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'MEMBER_REMOVED' },
    });
  }

  async isActiveMemberEmail(churchId: string, email: string): Promise<boolean> {
    const count = await this.prisma.churchMember.count({
      where: { churchId, isActive: true, user: { email } },
    });
    return count > 0;
  }

  findChurch(churchId: string) {
    return this.prisma.church.findUnique({
      where: { id: churchId },
      select: { id: true, name: true, timezone: true },
    });
  }

  findUserName(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
  }

  /* ----------------------------------------------------------- Invitaciones */

  listPendingInvitations(churchId: string) {
    return this.prisma.invitation.findMany({
      where: { churchId, ...PENDING },
      include: INVITATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findPendingInvitation(churchId: string, id: string) {
    return this.prisma.invitation.findFirst({
      where: { id, churchId, ...PENDING },
      include: INVITATION_INCLUDE,
    });
  }

  /**
   * Crea la invitacion revocando antes la pendiente para el mismo correo, en la
   * misma transaccion: el indice unico parcial no admite dos pendientes.
   */
  createInvitation(churchId: string, invitation: NewInvitation) {
    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { churchId, email: invitation.email, ...PENDING },
        data: { revokedAt: new Date() },
      });

      return tx.invitation.create({
        data: { churchId, ...invitation },
        include: INVITATION_INCLUDE,
      });
    });
  }

  renewInvitation(
    churchId: string,
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.prisma.invitation.update({
      where: { id, churchId },
      data: { tokenHash, expiresAt },
      include: INVITATION_INCLUDE,
    });
  }

  async revokeInvitation(churchId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id, churchId, ...PENDING },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Busqueda publica por token (lookup y aceptar). Es la unica lectura sin
   * `churchId`: quien acepta todavia no tiene sesion, y el hash de un token de
   * 32 bytes aleatorios ya identifica una sola fila.
   */
  findPendingInvitationByTokenHash(tokenHash: string) {
    return this.prisma.invitation.findFirst({
      where: { tokenHash, ...PENDING, expiresAt: { gt: new Date() } },
      include: {
        ...INVITATION_INCLUDE,
        church: { select: { id: true, name: true } },
      },
    });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findMembership(churchId: string, userId: string) {
    return this.prisma.churchMember.findUnique({
      where: { churchId_userId: { churchId, userId } },
    });
  }

  /**
   * Acepta la invitacion de una vez: crea el usuario si hace falta, crea o
   * reactiva la membresia con el rol invitado, marca la invitacion y deja esta
   * iglesia como la ultima usada. Devuelve el id del usuario, o null si la
   * invitacion dejo de estar pendiente mientras tanto (otra pestana la acepto).
   */
  acceptInvitation(
    churchId: string,
    invitationId: string,
    role: MemberRole,
    account: { userId: string } | { newUser: NewInvitedUser },
  ): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitationId, churchId, ...PENDING },
        data: { acceptedAt: new Date() },
      });
      if (count !== 1) return null;

      const userId =
        'userId' in account
          ? account.userId
          : (await tx.user.create({ data: account.newUser })).id;

      await tx.churchMember.upsert({
        where: { churchId_userId: { churchId, userId } },
        create: { churchId, userId, role },
        update: { role, isActive: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { lastChurchId: churchId, lastLoginAt: new Date() },
      });

      return userId;
    });
  }
}

export type MemberWithUser = NonNullable<
  Awaited<ReturnType<MembersRepository['findActiveMember']>>
>;
