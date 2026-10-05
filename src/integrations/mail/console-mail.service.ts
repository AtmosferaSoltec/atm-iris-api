import { Injectable, Logger } from '@nestjs/common';

import {
  MailPort,
  type InvitationMail,
  type PasswordChangedMail,
  type PasswordResetCodeMail,
} from './mail.port.js';

/**
 * Implementacion de desarrollo: escribe el correo en el log en lugar de
 * enviarlo. Nunca debe quedar activa en produccion — imprimir un codigo de
 * recuperacion en los logs equivale a publicarlo (ver `MailModule`).
 */
@Injectable()
export class ConsoleMailService extends MailPort {
  private readonly logger = new Logger(ConsoleMailService.name);

  async sendPasswordResetCode(input: PasswordResetCodeMail): Promise<void> {
    this.logger.warn(
      `[correo simulado] Código de recuperación para ${input.to}: ${input.code} ` +
        `(vence en ${input.expiresInMinutes} min)`,
    );
  }

  async sendPasswordChanged(input: PasswordChangedMail): Promise<void> {
    this.logger.warn(
      `[correo simulado] Aviso de contraseña cambiada para ${input.to}`,
    );
  }

  async sendInvitation(input: InvitationMail): Promise<void> {
    this.logger.warn(
      `[correo simulado] Invitación a ${input.churchName} para ${input.to} ` +
        `como ${input.roleLabel}: ${input.acceptUrl} (vence el ${input.expiresOn})`,
    );
  }
}
