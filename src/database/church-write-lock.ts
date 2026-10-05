import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

export type Tx = Prisma.TransactionClient;

/**
 * Serializa las escrituras de contenido de una iglesia.
 *
 * `sync_version` sale de una secuencia, y una secuencia no garantiza que la
 * version 41 se confirme antes que la 42: si la 42 se confirma primero y una
 * consola sincroniza en ese instante, su cursor salta la 41 para siempre. Con
 * este candado transaccional, dentro de una iglesia las escrituras se confirman
 * en el mismo orden en que toman version, y el feed de `/sync/changes` nunca se
 * salta filas. Iglesias distintas no se esperan entre si.
 *
 * Todo repositorio que escriba en una tabla sincronizable (iglesia, personas,
 * tipos de servicio, canciones, medios, registros) pasa por aqui.
 */
@Injectable()
export class ChurchWriteLock {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return withChurchLock(this.prisma, churchId, work);
  }
}

export function withChurchLock<T>(
  prisma: PrismaService,
  churchId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockChurch(tx, churchId);
    return work(tx);
  });
}

/** Para quien ya esta dentro de una transaccion propia. */
export async function lockChurch(tx: Tx, churchId: string): Promise<void> {
  // `$executeRaw` y no `$queryRaw`: la funcion devuelve `void` y el cliente no
  // sabe deserializar esa columna.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`iris_sync:${churchId}`}, 0))`;
}
