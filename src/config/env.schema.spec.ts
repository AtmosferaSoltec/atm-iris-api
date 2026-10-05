import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const VALID = {
  DATABASE_URL: 'postgresql://iris_app:x@localhost:5432/iris?schema=iris',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica los valores por defecto del auth', () => {
    const env = validateEnv(VALID);

    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_IDLE_DAYS).toBe(60);
    expect(env.PORT).toBe(3020);
  });

  it('junta todos los errores en un solo mensaje', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'corto' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*REFRESH_TOKEN_SECRET/,
    );
  });

  it('trata las variables de correo vacias como ausentes', () => {
    const env = validateEnv({ ...VALID, RESEND_API_KEY: '', MAIL_FROM: '' });

    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.MAIL_FROM).toBeUndefined();
  });
});
