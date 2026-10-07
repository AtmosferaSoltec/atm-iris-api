import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  FORGOT_PASSWORD_THROTTLE,
  LOGIN_THROTTLE,
  RESET_CODE_THROTTLE,
  SIGN_UP_THROTTLE,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type {
  AuthenticatedUser,
  AuthResult,
  DeviceSession,
  RequestOrigin,
  SessionView,
} from './auth.types.js';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
  forgotPasswordSchema,
  refreshSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyResetCodeSchema,
  type ForgotPasswordInput,
  type RefreshInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
  type VerifyResetCodeInput,
} from './dto/auth.schema.js';

/** Respuesta del paso 1 de la recuperacion: nunca revela si existe la cuenta. */
const RESET_REQUESTED = {
  message:
    'Si el correo corresponde a una cuenta de Iris, te enviamos un código de 6 dígitos.',
};

/** IP real (detras del proxy de confianza) y navegador o app, para la sesion. */
export function originOf(request: Request): RequestOrigin {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 255),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('sign-up')
  @Throttle({ default: SIGN_UP_THROTTLE })
  @ApiOperation({
    summary: 'Crear la cuenta de una iglesia y abrir la primera sesión',
  })
  @ApiData('AuthResult', { status: 201 })
  signUp(
    @Body(new ZodValidationPipe(signUpSchema)) dto: SignUpInput,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.signUp(dto, originOf(request));
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  // Cinco intentos por IP: aqui no se frena el uso del sistema, se frena a quien
  // prueba contrasenas.
  @Throttle({ default: LOGIN_THROTTLE })
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @ApiData('AuthResult')
  signIn(
    @Body(new ZodValidationPipe(signInSchema)) dto: SignInInput,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.signIn(dto, originOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar el refresh token por un par nuevo' })
  @ApiData('AuthResult')
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshInput,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken, originOf(request));
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar la sesión de este dispositivo' })
  signOut(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.signOut(user);
  }

  @Post('sign-out-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar la sesión en todos los dispositivos' })
  signOutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.signOutAll(user);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario, iglesia y sesión actuales' })
  @ApiData('SessionView')
  me(@CurrentUser() user: AuthenticatedUser): Promise<SessionView> {
    return this.auth.getSession(user);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar el nombre del usuario' })
  @ApiData('SessionView')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileInput,
  ): Promise<SessionView> {
    return this.auth.updateProfile(user, dto.fullName);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambiar la contraseña y cerrar las demás sesiones',
  })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordInput,
  ): Promise<void> {
    return this.auth.changePassword(user, dto);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dispositivos con sesión abierta' })
  @ApiData('DeviceSession', { isArray: true })
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<DeviceSession[]> {
    return this.auth.listSessions(user);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar la sesión de un dispositivo propio' })
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.auth.revokeSession(user, id);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: FORGOT_PASSWORD_THROTTLE })
  @ApiOperation({ summary: 'Paso 1: enviar un código de 6 dígitos al correo' })
  @ApiData('Message')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput,
  ) {
    await this.auth.requestPasswordReset(dto.email);
    return RESET_REQUESTED;
  }

  @Public()
  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RESET_CODE_THROTTLE })
  @ApiOperation({
    summary: 'Paso 2: comprobar el código antes de pedir la contraseña nueva',
  })
  @ApiData('ResetCodeValid')
  async verifyResetCode(
    @Body(new ZodValidationPipe(verifyResetCodeSchema))
    dto: VerifyResetCodeInput,
  ) {
    await this.auth.verifyResetCode(dto);
    return { valid: true as const };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RESET_CODE_THROTTLE })
  @ApiOperation({
    summary: 'Paso 3: crear la contraseña nueva y cerrar todas las sesiones',
  })
  @ApiData('Message')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput,
  ) {
    await this.auth.resetPassword(dto);
    return {
      message: 'Tu contraseña quedó actualizada. Ya puedes iniciar sesión.',
    };
  }
}
