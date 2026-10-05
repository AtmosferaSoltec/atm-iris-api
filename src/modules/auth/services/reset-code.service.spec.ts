import { describe, expect, it } from 'vitest';

import { ResetCodeService } from './reset-code.service.js';

describe('ResetCodeService', () => {
  const service = new ResetCodeService();

  it('genera siempre seis digitos', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(service.generate()).toMatch(/^\d{6}$/);
    }
  });

  it('rellena con ceros a la izquierda', () => {
    // Sin el padding, un codigo como 42 se enviaria con dos digitos y no
    // encajaria con el input de seis casillas del frontend.
    const codes = Array.from({ length: 500 }, () => service.generate());

    expect(codes.every((code) => code.length === 6)).toBe(true);
  });

  it('no repite el mismo codigo una y otra vez', () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => service.generate()),
    );

    expect(codes.size).toBeGreaterThan(90);
  });

  it('el hash no contiene el codigo en claro', async () => {
    const code = service.generate();
    const hashed = await service.hash(code);

    expect(hashed).not.toContain(code);
    expect(hashed).toMatch(/^\$argon2id\$/);
  });

  it('reconoce el codigo correcto y rechaza el resto', async () => {
    const hashed = await service.hash('123456');

    await expect(service.matches('123456', hashed)).resolves.toBe(true);
    await expect(service.matches('123457', hashed)).resolves.toBe(false);
    await expect(service.matches('', hashed)).resolves.toBe(false);
  });

  it('devuelve false con un hash corrupto en vez de lanzar', async () => {
    // Un registro dañado en la base no debe tumbar el endpoint.
    await expect(service.matches('123456', 'no-es-un-hash')).resolves.toBe(
      false,
    );
  });
});
