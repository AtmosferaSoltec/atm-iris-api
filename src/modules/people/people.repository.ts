import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';

type Db = PrismaService | Tx;

@Injectable()
export class PeopleRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  /** Toda escritura de personas va bajo el candado de la iglesia. */
  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  listActive(churchId: string) {
    return this.prisma.person.findMany({ where: { churchId, deletedAt: null } });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.person.findFirst({ where: { id, churchId, deletedAt: null } });
  }

  /** Para la sincronizacion: incluye borradas. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.person.findMany({ where: { churchId, id: { in: ids } } });
  }

  /**
   * Busca un id en cualquier iglesia, borrado o no. Es la unica lectura sin
   * `churchId`: hace falta para distinguir "ya lo cree yo" (200) de "es de
   * otra iglesia" (409 ID_CONFLICT) cuando la consola reintenta con su id.
   */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.person.findUnique({ where: { id } });
  }

  async isNameTaken(
    churchId: string,
    nameKey: string,
    exceptId: string | null,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const count = await db.person.count({
      where: {
        churchId,
        nameKey,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    return count > 0;
  }

  create(
    churchId: string,
    data: { id?: string; name: string; nameKey: string },
    tx: Tx,
  ) {
    return tx.person.create({ data: { churchId, ...data } });
  }

  rename(
    churchId: string,
    id: string,
    data: { name: string; nameKey: string },
    tx: Tx,
  ) {
    return tx.person.update({ where: { id, churchId }, data });
  }

  /**
   * Borrado suave. Ademas quita a la persona como responsable sugerida de las
   * plantillas y toca esos tipos de servicio para que suban de version y las
   * consolas se enteren. Los registros de tiempos no se tocan: guardan su
   * propia copia del nombre.
   */
  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    const affected = await tx.serviceType.findMany({
      where: { churchId, blocks: { some: { defaultPersonId: id } } },
      select: { id: true },
    });

    await tx.blockTemplate.updateMany({
      where: { defaultPersonId: id, serviceType: { churchId } },
      data: { defaultPersonId: null },
    });
    if (affected.length > 0) {
      await tx.serviceType.updateMany({
        where: { churchId, id: { in: affected.map((s) => s.id) } },
        data: { updatedAt: new Date() },
      });
    }

    await tx.person.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Bloques dirigidos por cada persona en registros no borrados, sin contar los
   * omitidos (los ajustados si cuentan).
   */
  async countBlocks(
    churchId: string,
    personIds: string[],
  ): Promise<Map<string, number>> {
    if (personIds.length === 0) return new Map();

    const rows = await this.prisma.blockRecord.groupBy({
      by: ['personId'],
      where: {
        personId: { in: personIds },
        status: { not: 'SKIPPED' },
        serviceRecord: { churchId, deletedAt: null },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.personId!, row._count._all]));
  }
}
