import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.schema.js';

export type ParsedRefreshToken = { sessionId: string; generation: number };

/**
 * Refresh tokens con forma `<sessionId>.<generation>.<firma>`.
 *
 * La firma es un HMAC con `REFRESH_TOKEN_SECRET`, asi que la base no guarda
 * ningun token: solo la generacion vigente de cada sesion. Una fuga de la tabla
 * no permite abrir ninguna sesion, y el servidor puede volver a firmar el token
 * vigente cuando dos peticiones refrescan a la vez (ver docs/plans/01-login/README.md).
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  sign(sessionId: string, generation: number): string {
    const body = `${sessionId}.${generation}`;
    return `${body}.${this.signature(body)}`;
  }

  /** null si el formato o la firma no cuadran. No consulta la base. */
  parse(token: string): ParsedRefreshToken | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [sessionId, generationText, signature] = parts as [
      string,
      string,
      string,
    ];
    if (!/^\d+$/.test(generationText)) return null;

    const expected = Buffer.from(
      this.signature(`${sessionId}.${generationText}`),
    );
    const received = Buffer.from(signature);
    // Comparacion en tiempo constante: una normal deja adivinar la firma byte
    // a byte midiendo cuanto tarda en fallar.
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return null;
    }

    return { sessionId, generation: Number(generationText) };
  }

  private signature(body: string): string {
    return createHmac(
      'sha256',
      this.config.get('REFRESH_TOKEN_SECRET', { infer: true }),
    )
      .update(body)
      .digest('base64url');
  }
}
