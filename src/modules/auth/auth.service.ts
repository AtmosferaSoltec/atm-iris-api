import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import type { Env } from '../../config/env.schema.js';
import type {
  ClientPlatform,
  MemberRole,
} from '../../generated/prisma/client.js';
import { MailPort } from '../../integrations/mail/mail.port.js';
import {
  REFRESH_REUSE_GRACE_SECONDS,
  RESET_CODE_TTL_MINUTES,
  RESET_MAX_REQUESTS_PER_DAY,
  RESET_MAX_VERIFICATION_ATTEMPTS,
} from './auth.constants.js';
import { AuthRepository, type SessionWithAccount } from './auth.repository.js';
import type {
  AuthenticatedUser,
  AuthResult,
  ChurchRole,
  ClientPlatformName,
  RequestOrigin,
  SessionView,
} from './auth.types.js';
import type {
  ClientInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
  VerifyResetCodeInput,
} from './dto/auth.schema.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
import { ResetCodeService } from './services/reset-code.service.js';
import { TokenService } from './services/token.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const PLATFORM_TO_DB: Record<ClientPlatformName, ClientPlatform> = {
  web: 'WEB',
  ios: 'IOS',
  windows: 'WINDOWS',
};

const toRole = (role: MemberRole): ChurchRole =>
  role === 'OWNER' ? 'owner' : 'member';
const toPlatform = (platform: ClientPlatform) =>
  platform.toLowerCase() as ClientPlatformName;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly resetCodes: ResetCodeService,
    private readonly mail: MailPort,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /* ---------------------------------------------------------- Cuenta y login */

  /** Crea la iglesia, su dueno y la primera sesion. */
  async signUp(input: SignUpInput, origin: RequestOrigin): Promise<AuthResult> {
    // Se pregunta antes para dar un mensaje claro; el indice unico cubre la
    // carrera de dos registros simultaneos (PrismaExceptionFilter → 409).
    if (await this.repository.emailExists(input.email)) throw this.emailTaken();

    const account = await this.repository.createAccount({
      churchName: input.churchName,
      fullName: input.fullName,
      email: input.email,
      passwordHash: await hash(input.password),
    });

    return this.openSession(
      account.user.id,
      account.church.id,
      input.client,
      origin,
    );
  }

  async signIn(input: SignInInput, origin: RequestOrigin): Promise<AuthResult> {
    const user = await this.repository.findUserByEmail(input.email);

    // El mismo error si el correo no existe o si la contrasena esta mal:
    // distinguirlos confirmaria que un correo tiene cuenta. Se verifica contra un
    // hash de relleno para que el tiempo de respuesta tampoco lo delate.
    const isValid = await this.verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash()),
    );

    if (!user || !isValid || !user.isActive) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.INVALID_CREDENTIALS,
        message:
          'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.',
      });
    }

    const membership = await this.repository.findPrimaryMembership(user.id);
    if (!membership) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.NO_CHURCH_ACCESS,
        message: 'Tu cuenta no tiene acceso a ninguna iglesia.',
      });
    }

    await this.repository.touchLastLogin(user.id);

    return this.openSession(user.id, membership.churchId, input.client, origin);
  }

  /**
   * Rota el refresh token. Ver docs/plans/01-auth.md: generacion vigente →
   * rota; anterior dentro de la gracia → devuelve el vigente; cualquier otra →
   * alguien tiene una copia, se revoca la sesion.
   */
  async refresh(
    refreshToken: string,
    origin: RequestOrigin,
  ): Promise<AuthResult> {
    const parsed = this.refreshTokens.parse(refreshToken);
    if (!parsed) throw this.invalidRefreshToken();

    const session = await this.repository.findSession(parsed.sessionId);
    if (!session || !this.isUsable(session)) throw this.invalidRefreshToken();

    if (parsed.generation === session.refreshGeneration) {
      const hasRotated = await this.repository.rotateSession(
        session.id,
        session.refreshGeneration,
        {
          expiresAt: this.nextExpiry(),
          ipAddress: origin.ipAddress ?? null,
          userAgent: origin.userAgent ?? null,
        },
      );
      // Si otra peticion roto primero, este token paso a ser el anterior: se
      // vuelve a evaluar y cae en la rama de gracia.
      if (!hasRotated) return this.refresh(refreshToken, origin);

      return this.issue(await this.reload(session.id));
    }

    const isPrevious = parsed.generation === session.refreshGeneration - 1;
    const isWithinGrace =
      Date.now() - session.rotatedAt.getTime() <=
      REFRESH_REUSE_GRACE_SECONDS * 1000;

    if (isPrevious && isWithinGrace) return this.issue(session);

    await this.repository.revokeSession(session.id, 'TOKEN_REUSE');
    this.logger.warn(
      `Refresh token reutilizado: sesion ${session.id} revocada`,
    );
    throw this.invalidRefreshToken();
  }

  async signOut(user: AuthenticatedUser): Promise<void> {
    await this.repository.revokeSession(user.sessionId, 'SIGN_OUT');
  }

  async signOutAll(user: AuthenticatedUser): Promise<void> {
    await this.repository.revokeUserSessions(user.userId, 'SIGN_OUT_ALL');
  }

  async getSession(user: AuthenticatedUser): Promise<SessionView> {
    const session = await this.repository.findSession(user.sessionId);
    const membership = await this.repository.findMembership(
      user.userId,
      user.churchId,
    );
    if (!session || !membership) throw this.invalidRefreshToken();

    return this.toView(session, membership.role);
  }

  /* --------------------------------------------------- Recuperacion de acceso */

  /**
   * Envia un codigo de 6 digitos al correo.
   *
   * Nunca revela si el correo tiene cuenta: siempre termina igual. Lo contrario
   * convierte este endpoint en un verificador de correos.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.repository.findUserByEmail(email);
    if (!user?.isActive) return;

    const sentToday = await this.repository.countResetCodesSince(
      user.id,
      new Date(Date.now() - DAY_MS),
    );
    if (sentToday >= RESET_MAX_REQUESTS_PER_DAY) return;

    const code = this.resetCodes.generate();
    await this.repository.createResetCode(
      user.id,
      await this.resetCodes.hash(code),
      new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000),
    );

    // El fallo del proveedor se traga a proposito: si se propagara, el endpoint
    // responderia 500 cuando el correo existe y 200 cuando no.
    try {
      await this.mail.sendPasswordResetCode({
        to: user.email,
        fullName: user.fullName,
        code,
        expiresInMinutes: RESET_CODE_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el codigo de recuperacion al usuario ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Comprueba el codigo sin consumirlo, para habilitar la pantalla 3. */
  async verifyResetCode(input: VerifyResetCodeInput): Promise<void> {
    await this.checkResetCode(input);
  }

  /** Cambia la contrasena y cierra todas las sesiones. Luego se inicia sesion de nuevo. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const { user } = await this.checkResetCode(input);

    await this.repository.resetPassword(user.id, await hash(input.password));

    try {
      await this.mail.sendPasswordChanged({
        to: user.email,
        fullName: user.fullName,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar del cambio de contrasena al usuario ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /* ----------------------------------------------------------------- Internos */

  private async checkResetCode(input: VerifyResetCodeInput) {
    const invalid = new BadRequestException({
      code: API_ERROR_CODES.RESET_CODE_INVALID,
      message: 'El código no es válido o ya venció. Solicita uno nuevo.',
    });

    const user = await this.repository.findUserByEmail(input.email);
    if (!user?.isActive) throw invalid;

    const record = await this.repository.findLatestActiveResetCode(user.id);
    if (!record) throw invalid;

    if (record.verificationAttempts >= RESET_MAX_VERIFICATION_ATTEMPTS) {
      // Quemado por intentos: se marca usado para que no siga vivo.
      await this.repository.markResetCodeUsed(record.id);
      throw new BadRequestException({
        code: API_ERROR_CODES.RESET_LIMIT_REACHED,
        message: 'Demasiados intentos con ese código. Solicita uno nuevo.',
      });
    }

    if (!(await this.resetCodes.matches(input.code, record.codeHash))) {
      await this.repository.incrementResetAttempts(record.id);
      throw invalid;
    }

    return { user, record };
  }

  private async openSession(
    userId: string,
    churchId: string,
    client: ClientInput,
    origin: RequestOrigin,
  ): Promise<AuthResult> {
    const session = await this.repository.createSession({
      userId,
      churchId,
      platform: PLATFORM_TO_DB[client.platform],
      deviceName: client.deviceName || null,
      expiresAt: this.nextExpiry(),
      ipAddress: origin.ipAddress ?? null,
      userAgent: origin.userAgent ?? null,
    });

    return this.issue(session);
  }

  /** Firma el par de tokens para el estado actual de la sesion. */
  private async issue(session: SessionWithAccount): Promise<AuthResult> {
    // El rol se relee en cada emision: si cambia, se nota en el proximo refresh.
    const membership = await this.repository.findMembership(
      session.userId,
      session.churchId,
    );
    if (!membership?.isActive) throw this.invalidRefreshToken();

    const view = this.toView(session, membership.role);
    const access = await this.tokens.signAccessToken({
      sub: session.userId,
      churchId: session.churchId,
      sid: session.id,
      role: view.role,
    });

    return {
      ...view,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: this.refreshTokens.sign(
        session.id,
        session.refreshGeneration,
      ),
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    };
  }

  private async reload(sessionId: string): Promise<SessionWithAccount> {
    const session = await this.repository.findSession(sessionId);
    if (!session) throw this.invalidRefreshToken();
    return session;
  }

  private toView(session: SessionWithAccount, role: MemberRole): SessionView {
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
      },
      church: { id: session.church.id, name: session.church.name },
      role: toRole(role),
      session: {
        id: session.id,
        platform: toPlatform(session.platform),
        deviceName: session.deviceName,
      },
    };
  }

  private isUsable(session: SessionWithAccount): boolean {
    return (
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.user.isActive
    );
  }

  private nextExpiry(): Date {
    return new Date(
      Date.now() +
        this.config.get('REFRESH_TOKEN_IDLE_DAYS', { infer: true }) * DAY_MS,
    );
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      code: API_ERROR_CODES.EMAIL_TAKEN,
      message: 'Ya existe una cuenta con ese correo. Intenta iniciar sesión.',
      errors: { email: 'Ya existe una cuenta con ese correo.' },
    });
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: API_ERROR_CODES.INVALID_REFRESH_TOKEN,
      message: 'Tu sesión expiró. Vuelve a iniciar sesión.',
    });
  }

  private verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return verify(passwordHash, password).catch(() => false);
  }

  /** Hash descartable, para que el login tarde lo mismo exista o no el usuario. */
  private dummyHash(): Promise<string> {
    return hash('contrasena-que-no-existe');
  }
}
