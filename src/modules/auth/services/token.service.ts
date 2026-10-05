import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../../../config/env.schema.js';
import type { AccessTokenPayload } from '../auth.types.js';

/**
 * Firma y verifica el access token: un JWT corto (15 min por defecto) que viaja
 * en `Authorization: Bearer` en cada peticion.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signAccessToken(
    payload: Omit<AccessTokenPayload, 'typ'>,
  ): Promise<{ token: string; expiresAt: Date }> {
    const ttlSeconds = this.config.get('ACCESS_TOKEN_TTL_SECONDS', {
      infer: true,
    });
    const token = await this.jwt.signAsync(
      { ...payload, typ: 'access' } satisfies AccessTokenPayload,
      { secret: this.secret, expiresIn: ttlSeconds, algorithm: 'HS256' },
    );

    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  /** Devuelve null en lugar de lanzar: un token invalido es un 401, no un 500. */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });

      return payload.typ === 'access' ? payload : null;
    } catch {
      return null;
    }
  }

  private get secret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }
}
