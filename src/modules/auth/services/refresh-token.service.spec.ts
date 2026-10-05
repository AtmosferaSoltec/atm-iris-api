import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../../config/env.schema.js';
import { RefreshTokenService } from './refresh-token.service.js';

const serviceWith = (secret: string) =>
  new RefreshTokenService({
    get: () => secret,
  } as unknown as ConfigService<Env, true>);

const SESSION_ID = '01a10cb0-1d82-76eb-8df0-ec813f69378c';

describe('RefreshTokenService', () => {
  const service = serviceWith('a'.repeat(48));

  it('firma y vuelve a leer la sesion y la generacion', () => {
    const token = service.sign(SESSION_ID, 4);

    expect(service.parse(token)).toEqual({
      sessionId: SESSION_ID,
      generation: 4,
    });
  });

  it('el mismo par sesion/generacion produce el mismo token', () => {
    // Es lo que permite devolver el token vigente durante la gracia sin
    // haberlo guardado.
    expect(service.sign(SESSION_ID, 1)).toBe(service.sign(SESSION_ID, 1));
  });

  it('rechaza un token con la generacion cambiada', () => {
    const [id, , signature] = service.sign(SESSION_ID, 1).split('.');

    expect(service.parse(`${id}.2.${signature}`)).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const forged = serviceWith('b'.repeat(48)).sign(SESSION_ID, 1);

    expect(service.parse(forged)).toBeNull();
  });

  it('rechaza formatos raros sin lanzar', () => {
    expect(service.parse('')).toBeNull();
    expect(service.parse('a.b')).toBeNull();
    expect(service.parse(`${SESSION_ID}.-1.firma`)).toBeNull();
  });
});
