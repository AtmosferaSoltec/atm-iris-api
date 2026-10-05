import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { ServiceTypeInput } from './dto/service-types.schema.js';

type Db = PrismaService | Tx;

const WITH_BLOCKS = { blocks: { orderBy: { position: 'asc' } } } as const;

/** Columnas del tipo de servicio a partir del cuerpo del contrato. */
function columns(input: ServiceTypeInput, nameKey: string) {
  return {
    name: input.name,
    nameKey,
    color: input.color,
    scheduleWeekday: input.schedule?.weekday ?? null,
    scheduleHour: input.schedule?.hour ?? null,
    scheduleMinute: input.schedule?.minute ?? null,
  };
}

@Injectable()
export class ServiceTypesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  listActive(churchId: string) {
    return this.prisma.serviceType.findMany({
      where: { churchId, deletedAt: null },
      include: WITH_BLOCKS,
    });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.serviceType.findFirst({
      where: { id, churchId, deletedAt: null },
      include: WITH_BLOCKS,
    });
  }

  /** Para la sincronizacion: incluye borrados. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.serviceType.findMany({
      where: { churchId, id: { in: ids } },
      include: WITH_BLOCKS,
    });
  }

  /**
   * Busca un id en cualquier iglesia, borrado o no: distingue el reintento de
   * la consola (mismo id, misma iglesia) del choque con otra iglesia.
   */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.serviceType.findUnique({ where: { id }, include: WITH_BLOCKS });
  }

  /** De que tipo de servicio es cada id de bloque que ya existe. */
  findBlockOwners(ids: string[], db: Db = this.prisma) {
    return db.blockTemplate.findMany({
      where: { id: { in: ids } },
      select: { id: true, serviceTypeId: true },
    });
  }

  async isNameTaken(
    churchId: string,
    nameKey: string,
    exceptId: string | null,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const count = await db.serviceType.count({
      where: {
        churchId,
        nameKey,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    return count > 0;
  }

  /** Ids de personas no borradas de la iglesia, entre los indicados. */
  async findActivePersonIds(
    churchId: string,
    ids: string[],
    db: Db = this.prisma,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.person.findMany({
      where: { churchId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  async create(
    churchId: string,
    id: string | undefined,
    input: ServiceTypeInput,
    nameKey: string,
    tx: Tx,
  ) {
    const created = await tx.serviceType.create({
      data: { id, churchId, ...columns(input, nameKey) },
    });
    await this.replaceBlocks(created.id, input.blocks, tx);
    return this.findActive(churchId, created.id, tx);
  }

  /**
   * Reemplazo completo. Actualizar el padre siempre (aunque solo cambien los
   * bloques) es lo que mueve `updated_at` y sube la version de sincronizacion.
   */
  async replace(
    churchId: string,
    id: string,
    input: ServiceTypeInput,
    nameKey: string,
    tx: Tx,
  ) {
    await tx.serviceType.update({
      where: { id, churchId },
      data: { ...columns(input, nameKey), updatedAt: new Date() },
    });
    await this.replaceBlocks(id, input.blocks, tx);
    return this.findActive(churchId, id, tx);
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.serviceType.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Conserva los bloques que vienen con id, crea los nuevos, borra los que
   * faltan y reescribe `position` segun el orden del arreglo. El unico de
   * `(service_type_id, position)` es diferible, asi que dos bloques pueden
   * intercambiar posiciones dentro de la misma transaccion.
   */
  private async replaceBlocks(
    serviceTypeId: string,
    blocks: ServiceTypeInput['blocks'],
    tx: Tx,
  ): Promise<void> {
    const keptIds = blocks.flatMap((block) => (block.id ? [block.id] : []));

    await tx.blockTemplate.deleteMany({
      where: { serviceTypeId, id: { notIn: keptIds } },
    });

    const existing = new Set(
      (
        await tx.blockTemplate.findMany({
          where: { serviceTypeId, id: { in: keptIds } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );

    for (const [position, block] of blocks.entries()) {
      const data = {
        position,
        name: block.name,
        plannedMinutes: block.plannedMinutes,
        defaultPersonId: block.defaultPersonId,
      };

      if (block.id && existing.has(block.id)) {
        await tx.blockTemplate.update({ where: { id: block.id }, data });
      } else {
        await tx.blockTemplate.create({
          data: { id: block.id, serviceTypeId, ...data },
        });
      }
    }
  }
}
