import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../config/env.schema.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * El cliente de Prisma como proveedor inyectable.
 *
 * Desde la version 7 la conexion va por un driver adapter en vez de un motor
 * binario: es `pg` quien mantiene el pool. El esquema se pasa explicito porque
 * el `?schema=` de la URL lo entiende Prisma, no el driver.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg(
        { connectionString: config.get('DATABASE_URL', { infer: true }) },
        { schema: 'iris' },
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Consulta trivial para el health check. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
