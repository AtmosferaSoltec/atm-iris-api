import { Global, Module } from '@nestjs/common';

import { ChurchWriteLock } from './church-write-lock.js';
import { PrismaService } from './prisma.service.js';

/**
 * Global a proposito: cada modulo de negocio necesita el cliente, y repetir el
 * import en los diez no aporta nada.
 */
@Global()
@Module({
  providers: [PrismaService, ChurchWriteLock],
  exports: [PrismaService, ChurchWriteLock],
})
export class DatabaseModule {}
