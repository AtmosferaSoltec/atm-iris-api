import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  documentNumber: z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 digitos.'),
  quantity: z.coerce.number().int().positive('La cantidad debe ser mayor a 0.'),
});

const metadata = { type: 'body' } as const;

describe('ZodValidationPipe', () => {
  it('devuelve el valor ya parseado y convertido', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(
      pipe.transform({ documentNumber: '45872310', quantity: '3' }, metadata),
    ).toEqual({
      documentNumber: '45872310',
      quantity: 3,
    });
  });

  it('entrega un error por campo, no un mensaje generico', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ documentNumber: '123', quantity: 0 }, metadata);
      expect.unreachable('deberia haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        errors: Record<string, string>;
      };

      expect(body.code).toBe('VALIDATION_FAILED');
      // Es lo que permite al formulario marcar el input correcto.
      expect(body.errors.documentNumber).toBe('El DNI debe tener 8 digitos.');
      expect(body.errors.quantity).toBe('La cantidad debe ser mayor a 0.');
    }
  });

  it('usa notacion de punto para los campos anidados', () => {
    const nested = z.object({
      customer: z.object({ name: z.string().min(3, 'Muy corto.') }),
    });
    const pipe = new ZodValidationPipe(nested);

    try {
      pipe.transform({ customer: { name: 'a' } }, metadata);
      expect.unreachable('deberia haber lanzado');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        errors: Record<string, string>;
      };
      expect(body.errors['customer.name']).toBe('Muy corto.');
    }
  });

  it('no atrapa errores que no son de validacion', () => {
    const exploding = z.any().transform(() => {
      throw new TypeError('fallo algo distinto');
    });
    const pipe = new ZodValidationPipe(exploding);

    expect(() => pipe.transform({}, metadata)).toThrowError(TypeError);
  });
});
