import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../config/env.schema.js';

import { ConsoleMailService } from './console-mail.service.js';
import { resolveMailService } from './mail.module.js';
import { ResendMailService } from './resend-mail.service.js';

/** `ConfigService` de mentira: solo hace falta `get` con `infer`. */
const configWith = (env: Partial<Env>): ConfigService<Env, true> =>
  ({ get: (key: keyof Env) => env[key] }) as unknown as ConfigService<
    Env,
    true
  >;

describe('resolveMailService', () => {
  it('usa Resend cuando hay credenciales', () => {
    const service = resolveMailService(
      configWith({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_prueba',
        MAIL_FROM: 'Iris <no-reply@iris.test>',
      }),
    );

    expect(service).toBeInstanceOf(ResendMailService);
  });

  it('cae al log en desarrollo cuando no hay credenciales', () => {
    const service = resolveMailService(configWith({ NODE_ENV: 'development' }));

    expect(service).toBeInstanceOf(ConsoleMailService);
  });

  // Lo importante de esta prueba: en produccion no debe haber forma de acabar
  // con ConsoleMailService, que escribe los codigos en el log.
  it('no arranca en produccion sin credenciales', () => {
    expect(() =>
      resolveMailService(configWith({ NODE_ENV: 'production' })),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('no arranca en produccion con la key pero sin remitente', () => {
    expect(() =>
      resolveMailService(
        configWith({ NODE_ENV: 'production', RESEND_API_KEY: 're_prueba' }),
      ),
    ).toThrow(/MAIL_FROM/);
  });
});
