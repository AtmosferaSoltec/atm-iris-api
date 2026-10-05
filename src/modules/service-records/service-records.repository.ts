import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { BlockStatus, Prisma } from '../../generated/prisma/client.js';
import type { ServiceRecordInput } from './dto/service-records.schema.js';
import { toDbBlockStatus } from './service-records.mapper.js';

type Db = PrismaService | Tx;

const WITH_BLOCKS = { blocks: { orderBy: { position: 'asc' } } } as const;

export type RecordFilters = { from?: Date; to?: Date; serviceTypeId?: string };

@Injectable()
export class ServiceRecordsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  list(churchId: string, filters: RecordFilters, page: { skip: number; take: number }) {
    return this.prisma.serviceRecord.findMany({
      where: listWhere(churchId, filters),
      include: WITH_BLOCKS,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      ...page,
    });
  }

  count(churchId: string, filters: RecordFilters): Promise<number> {
    return this.prisma.serviceRecord.count({ where: listWhere(churchId, filters) });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.serviceRecord.findFirst({
      where: { id, churchId, deletedAt: null },
      include: WITH_BLOCKS,
    });
  }

  /** Para la sincronizacion: incluye borrados. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.serviceRecord.findMany({
      where: { churchId, id: { in: ids } },
      include: WITH_BLOCKS,
    });
  }

  /** Busca el id en cualquier iglesia, borrado o no (idempotencia vs `ID_CONFLICT`). */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.serviceRecord.findUnique({ where: { id }, include: WITH_BLOCKS });
  }

  /** A que registro pertenece cada id de bloque que ya existe. */
  findBlockOwners(ids: string[], db: Db = this.prisma) {
    return db.blockRecord.findMany({
      where: { id: { in: ids } },
      select: { id: true, serviceRecordId: true },
    });
  }

  /**
   * Si el tipo de servicio es de la iglesia. Se acepta aunque este borrado: la
   * consola pudo terminar el servicio sin conexion justo cuando alguien lo borro.
   */
  async serviceTypeBelongs(
    churchId: string,
    serviceTypeId: string,
    db: Db = this.prisma,
  ): Promise<boolean> {
    return (await db.serviceType.count({ where: { id: serviceTypeId, churchId } })) > 0;
  }

  findActivePerson(churchId: string, personId: string, db: Db = this.prisma) {
    return db.person.findFirst({
      where: { id: personId, churchId, deletedAt: null },
      select: { name: true },
    });
  }

  create(
    churchId: string,
    id: string,
    input: ServiceRecordInput,
    sessionId: string,
    tx: Tx,
  ) {
    return tx.serviceRecord.create({
      data: {
        id,
        churchId,
        date: input.date,
        serviceTypeId: input.serviceTypeId,
        serviceTypeName: input.serviceTypeName,
        createdBySessionId: sessionId,
        blocks: { create: blockRows(input) },
      },
      include: WITH_BLOCKS,
    });
  }

  /** Reemplazo completo de los bloques; actualizar el padre sube su version. */
  async replace(churchId: string, id: string, input: ServiceRecordInput, tx: Tx) {
    await tx.blockRecord.deleteMany({ where: { serviceRecordId: id } });
    return tx.serviceRecord.update({
      where: { id, churchId },
      data: {
        date: input.date,
        serviceTypeId: input.serviceTypeId,
        serviceTypeName: input.serviceTypeName,
        updatedAt: new Date(),
        blocks: { create: blockRows(input) },
      },
      include: WITH_BLOCKS,
    });
  }

  /** Cambia un bloque y toca el registro, que es el que lleva la version. */
  async updateBlock(
    churchId: string,
    recordId: string,
    blockId: string,
    data: { actualSeconds?: number; status?: BlockStatus; personId?: string | null; personName?: string | null },
    tx: Tx,
  ) {
    await tx.blockRecord.update({
      where: { id: blockId, serviceRecordId: recordId },
      data,
    });
    return tx.serviceRecord.update({
      where: { id: recordId, churchId },
      data: { updatedAt: new Date() },
      include: WITH_BLOCKS,
    });
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.serviceRecord.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }
}

function listWhere(churchId: string, filters: RecordFilters): Prisma.ServiceRecordWhereInput {
  return {
    churchId,
    deletedAt: null,
    ...(filters.serviceTypeId ? { serviceTypeId: filters.serviceTypeId } : {}),
    // `from` inclusivo, `to` exclusivo (contrato §14).
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lt: filters.to } : {}),
          },
        }
      : {}),
  };
}

function blockRows(input: ServiceRecordInput) {
  return input.blocks.map((block, position) => ({
    id: block.id,
    position,
    name: block.name,
    plannedSeconds: block.plannedSeconds,
    actualSeconds: block.actualSeconds,
    personId: block.personId,
    personName: block.personName,
    status: toDbBlockStatus(block.status),
  }));
}
