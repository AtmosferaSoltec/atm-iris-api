import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Genera y comprueba los codigos de recuperacion.
 *
 * Aparte para poder probar la generacion sin base de datos, y para que quede
 * en un solo lugar la decision de guardarlos hasheados: una fuga de la tabla no
 * debe entregar codigos utilizables.
 */
@Injectable()
export class ResetCodeService {
  /** Seis digitos, con ceros a la izquierda si hacen falta. */
  generate(): string {
    // `randomInt` y no `Math.random`: el segundo es predecible, y con el un
    // atacante que conozca el momento del envio puede adivinar el codigo.
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  hash(code: string): Promise<string> {
    return hash(code);
  }

  async matches(code: string, codeHash: string): Promise<boolean> {
    try {
      return await verify(codeHash, code);
    } catch {
      return false;
    }
  }
}
