import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema.js';

/**
 * `ConfigService` tipado contra el esquema. Evita el `configService.get<string>('X')`
 * suelto, donde un nombre mal escrito pasa el compilador y devuelve `undefined`.
 */
export type TypedConfigService = ConfigService<Env, true>;

export const isProduction = (config: TypedConfigService): boolean =>
  config.get('NODE_ENV', { infer: true }) === 'production';
