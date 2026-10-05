import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import type { Env } from '../../config/env.schema.js';
import { MailPort } from '../../integrations/mail/mail.port.js';
import { toDbRole, toRole } from '../auth/auth.mapper.js';
import { AuthService } from '../auth/auth.service.js';
import type {
  AuthenticatedUser,
  AuthResult,
  RequestOrigin,
} from '../auth/auth.types.js';
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
} from './dto/members.schema.js';
import { INVITATION_TTL_DAYS, ROLE_LABELS } from './members.constants.js';
import { toInvitation } from './members.mapper.js';
import { MembersRepository } from './members.repository.js';
import { assertCanManage } from './members.service.js';
import type { Invitation, InvitationPreview } from './members.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Invitaciones por correo (contrato §7).
 *
 * El token (32 bytes aleatorios, base64url) solo existe en el enlace del correo;
 * la base guarda su SHA-256. SHA y no argon2: el token ya tiene 256 bits de
 * entropia, no hay diccionario que probar, y hace falta buscar por el hash.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly repository: MembersRepository,
    private readonly auth: AuthService,
    private readonly mail: MailPort,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(user: AuthenticatedUser): Promise<Invitation[]> {
    const rows = await this.repository.listPendingInvitations(user.churchId);
    return rows.map(toInvitation);
  }

  async create(
    user: AuthenticatedUser,
    input: CreateInvitationInput,
  ): Promise<Invitation> {
    const role = toDbRole(input.role);
    assertCanManage(user, role, role);

    if (await this.repository.isActiveMemberEmail(user.churchId, input.email)) {
      throw new ConflictException({
        code: API_ERROR_CODES.ALREADY_MEMBER,
        message: 'Esa persona ya forma parte del equipo.',
        errors: { email: 'Esa persona ya forma parte del equipo.' },
      });
    }

    const token = newToken();
    // Si ya habia una pendiente para ese correo, el repositorio la revoca: la
    // nueva la reemplaza.
    const invitation = await this.repository.createInvitation(user.churchId, {
      email: input.email,
      role,
      tokenHash: hashToken(token),
      invitedByUserId: user.userId,
      expiresAt: expiry(),
    });

    await this.send(user.churchId, invitation, token);
    return toInvitation(invitation);
  }

  /** Token y vencimiento nuevos: el enlace anterior deja de servir. */
  async resend(user: AuthenticatedUser, id: string): Promise<Invitation> {
    const pending = await this.repository.findPendingInvitation(
      user.churchId,
      id,
    );
    if (!pending) throw invitationNotFound();
    assertCanManage(user, pending.role, pending.role);

    const token = newToken();
    const invitation = await this.repository.renewInvitation(
      user.churchId,
      id,
      hashToken(token),
      expiry(),
    );

    await this.send(user.churchId, invitation, token);
    return toInvitation(invitation);
  }

  async revoke(user: AuthenticatedUser, id: string): Promise<void> {
    const pending = await this.repository.findPendingInvitation(
      user.churchId,
      id,
    );
    if (!pending) throw invitationNotFound();
    assertCanManage(user, pending.role, pending.role);

    await this.repository.revokeInvitation(user.churchId, id);
  }

  /** Lo que la pantalla de aceptar muestra antes de pedir datos. Publico. */
  async lookup(token: string): Promise<InvitationPreview> {
    const invitation = await this.findValid(token);
    const user = await this.repository.findUserByEmail(invitation.email);

    return {
      churchName: invitation.church.name,
      email: invitation.email,
      role: toRole(invitation.role),
      invitedByName: invitation.invitedBy.fullName,
      expiresAt: invitation.expiresAt.toISOString(),
      hasAccount: Boolean(user),
    };
  }

  /**
   * Acepta y entra. Con cuenta existente pide la contrasena de esa cuenta (no se
   * puede sumar a alguien a una iglesia solo con tener el enlace); sin cuenta,
   * la crea con el nombre y la contrasena que manda.
   */
  async accept(
    input: AcceptInvitationInput,
    origin: RequestOrigin,
  ): Promise<AuthResult> {
    const invitation = await this.findValid(input.token);
    const churchId = invitation.church.id;
    const existing = await this.repository.findUserByEmail(invitation.email);

    let account: Parameters<MembersRepository['acceptInvitation']>[3];

    if (existing) {
      const isValid = await verify(existing.passwordHash, input.password).catch(
        () => false,
      );
      if (!isValid || !existing.isActive) {
        throw new UnauthorizedException({
          code: API_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'La contraseña no coincide con la de tu cuenta de Iris.',
          errors: { password: 'La contraseña no coincide con la de tu cuenta.' },
        });
      }

      const membership = await this.repository.findMembership(
        churchId,
        existing.id,
      );
      if (membership?.isActive) {
        throw new ConflictException({
          code: API_ERROR_CODES.ALREADY_MEMBER,
          message: 'Ya formas parte de esta iglesia. Inicia sesión.',
        });
      }

      account = { userId: existing.id };
    } else {
      const errors: Record<string, string> = {};
      if (!input.fullName) errors.fullName = 'Escribe tu nombre.';
      if (input.password.length < 8) errors.password = 'Usa al menos 8 caracteres.';
      if (Object.keys(errors).length > 0) {
        throw new BadRequestException({
          code: API_ERROR_CODES.VALIDATION_FAILED,
          message: 'Revisa los datos enviados.',
          errors,
        });
      }

      account = {
        newUser: {
          email: invitation.email,
          fullName: input.fullName!,
          passwordHash: await hash(input.password),
        },
      };
    }

    const userId = await this.repository.acceptInvitation(
      churchId,
      invitation.id,
      invitation.role,
      account,
    );
    if (!userId) throw invitationInvalid();

    return this.auth.openSession(userId, churchId, input.client, origin);
  }

  private async findValid(token: string) {
    const invitation = await this.repository.findPendingInvitationByTokenHash(
      hashToken(token),
    );
    if (!invitation) throw invitationInvalid();
    return invitation;
  }

  /**
   * Envia el correo. Si el proveedor falla, la invitacion queda creada y se
   * registra el error: desde la web se puede reenviar.
   */
  private async send(
    churchId: string,
    invitation: Awaited<ReturnType<MembersRepository['createInvitation']>>,
    token: string,
  ): Promise<void> {
    try {
      const church = await this.repository.findChurch(churchId);
      if (!church) return;

      const url = new URL('/invitacion', this.config.get('WEB_URL', { infer: true }));
      url.searchParams.set('token', token);

      await this.mail.sendInvitation({
        to: invitation.email,
        churchName: church.name,
        invitedByName: invitation.invitedBy.fullName,
        roleLabel: ROLE_LABELS[toRole(invitation.role)],
        acceptUrl: url.toString(),
        expiresOn: new Intl.DateTimeFormat('es', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: church.timezone,
        }).format(invitation.expiresAt),
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar la invitacion ${invitation.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

const newToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const expiry = () => new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS);

const invitationInvalid = () =>
  new BadRequestException({
    code: API_ERROR_CODES.INVITATION_INVALID,
    message:
      'Esta invitación ya no es válida. Pide a quien te invitó que te envíe una nueva.',
  });

const invitationNotFound = () =>
  new NotFoundException({
    code: API_ERROR_CODES.NOT_FOUND,
    message: 'Esa invitación no existe o ya no está pendiente.',
  });
