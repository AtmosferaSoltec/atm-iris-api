import { describe, expect, it } from 'vitest';

import { resetPasswordSchema, signInSchema } from './auth.schema.js';

describe('auth schemas', () => {
  it('normaliza el correo a minusculas y sin espacios', () => {
    const parsed = signInSchema.parse({
      email: '  Pastor@VidaNueva.ORG ',
      password: 'x',
      client: { platform: 'web' },
    });

    expect(parsed.email).toBe('pastor@vidanueva.org');
  });

  it('solo acepta las plataformas conocidas', () => {
    const result = signInSchema.safeParse({
      email: 'a@b.org',
      password: 'x',
      client: { platform: 'tv' },
    });

    expect(result.success).toBe(false);
  });

  it('exige que la confirmacion coincida', () => {
    const result = resetPasswordSchema.safeParse({
      email: 'a@b.org',
      code: '123456',
      password: 'nuevaclave123',
      passwordConfirmation: 'otra-cosa',
    });

    expect(result.error?.issues[0]?.path).toEqual(['passwordConfirmation']);
  });

  it('el codigo son exactamente 6 digitos', () => {
    const base = {
      email: 'a@b.org',
      password: '12345678',
      passwordConfirmation: '12345678',
    };

    expect(
      resetPasswordSchema.safeParse({ ...base, code: '12345' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, code: '12345a' }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, code: '012345' }).success,
    ).toBe(true);
  });
});
