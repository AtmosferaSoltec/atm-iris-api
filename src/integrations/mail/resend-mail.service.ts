import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { Env } from '../../config/env.schema.js';

import {
  MailPort,
  type PasswordChangedMail,
  type PasswordResetCodeMail,
} from './mail.port.js';
import { renderTemplate } from './render-template.js';
import { PASSWORD_CHANGED_HTML } from './templates/password-changed.generated.js';
import { PASSWORD_RESET_HTML } from './templates/password-reset.generated.js';

type Message = { to: string; subject: string; html: string; text: string };

/**
 * Envio real de correo, con Resend.
 *
 * El HTML llega ya compilado desde el `.mjml`; este servicio solo rellena los
 * marcadores. Un cambio de diseno se hace en la plantilla y `pnpm mail:build`.
 */
@Injectable()
export class ResendMailService extends MailPort {
  private readonly logger = new Logger(ResendMailService.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();

    // El `!` se sostiene en `MailModule`, que solo instancia esta clase con
    // ambas variables presentes.
    this.client = new Resend(config.get('RESEND_API_KEY', { infer: true })!);
    this.from = config.get('MAIL_FROM', { infer: true })!;
  }

  async sendPasswordResetCode(input: PasswordResetCodeMail): Promise<void> {
    const id = await this.send({
      to: input.to,
      subject: `Tu código de Iris: ${input.code}`,
      html: renderTemplate(PASSWORD_RESET_HTML, {
        fullName: input.fullName,
        code: input.code,
        expiresInMinutes: input.expiresInMinutes,
      }),
      text: [
        `Hola, ${input.fullName}`,
        '',
        'Pediste restablecer tu contraseña de Iris. Ingresa este código para continuar:',
        '',
        input.code,
        '',
        `Vence en ${input.expiresInMinutes} minutos y sirve una sola vez.`,
        '',
        'Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.',
      ].join('\n'),
    });

    // Sin el asunto ni el codigo: el log no es lugar para ninguno de los dos.
    this.logger.log(`Codigo de recuperacion enviado (id ${id})`);
  }

  async sendPasswordChanged(input: PasswordChangedMail): Promise<void> {
    const id = await this.send({
      to: input.to,
      subject: 'Tu contraseña de Iris cambió',
      html: renderTemplate(PASSWORD_CHANGED_HTML, { fullName: input.fullName }),
      text: [
        `Hola, ${input.fullName}`,
        '',
        'La contraseña de tu cuenta de Iris acaba de cambiar y cerramos la sesión en todos tus dispositivos.',
        '',
        'Si fuiste tú, no tienes que hacer nada: vuelve a iniciar sesión con la contraseña nueva.',
        'Si no fuiste tú, recupera tu acceso desde "¿Olvidaste tu contraseña?" cuanto antes.',
      ].join('\n'),
    });

    this.logger.log(`Aviso de contrasena cambiada enviado (id ${id})`);
  }

  private async send(message: Message): Promise<string | undefined> {
    // Resend devuelve el error en la respuesta en vez de lanzarlo: ignorarlo
    // daria por enviado un correo que nunca salio.
    const { data, error } = await this.client.emails.send({
      from: this.from,
      ...message,
      // Sin esto, los clientes agrupan en un hilo los correos con el mismo
      // asunto: quien pide dos codigos tiene que verlos como dos correos.
      headers: { 'X-Entity-Ref-ID': `${Date.now()}` },
    });

    if (error) {
      throw new Error(
        `Resend rechazo el envio: ${error.name} - ${error.message}`,
      );
    }

    return data?.id;
  }
}
