import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isProduction } from '../../config/app.config.js';
import type { Env } from '../../config/env.schema.js';

import { ConsoleMailService } from './console-mail.service.js';
import { MailPort } from './mail.port.js';
import { ResendMailService } from './resend-mail.service.js';

/**
 * Elige la implementacion segun el entorno.
 *
 * En desarrollo, sin credenciales, queda `ConsoleMailService` y el flujo de
 * recuperacion se recorre entero leyendo el codigo en el log. En produccion eso
 * seria publicar los codigos, asi que faltar las credenciales tumba el arranque
 * en vez de degradarse en silencio.
 */
export function resolveMailService(config: ConfigService<Env, true>): MailPort {
  const apiKey = config.get('RESEND_API_KEY', { infer: true });
  const from = config.get('MAIL_FROM', { infer: true });

  if (apiKey && from) return new ResendMailService(config);

  if (isProduction(config)) {
    throw new Error(
      'Faltan RESEND_API_KEY o MAIL_FROM. En produccion el correo no puede ' +
        'caer al log: ahi los codigos de recuperacion quedan a la vista.',
    );
  }

  new Logger('MailModule').warn(
    'Correo sin configurar: los codigos de recuperacion se escriben en el log.',
  );

  return new ConsoleMailService();
}

@Global()
@Module({
  providers: [
    {
      provide: MailPort,
      inject: [ConfigService],
      useFactory: resolveMailService,
    },
  ],
  exports: [MailPort],
})
export class MailModule {}
