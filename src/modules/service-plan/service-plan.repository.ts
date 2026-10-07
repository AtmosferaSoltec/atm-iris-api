import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PlanItemKind } from '../../generated/prisma/client.js';

type Db = PrismaService | Tx;

@Injectable()
export class ServicePlanRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  listActive(churchId: string) {
    return this.prisma.servicePlanItem.findMany({
      where: { churchId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.servicePlanItem.findFirst({
      where: { id, churchId, deletedAt: null },
    });
  }

  /** Para la sincronizacion: incluye borradas. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.servicePlanItem.findMany({
      where: { churchId, id: { in: ids } },
    });
  }

  /** Busca el id en cualquier iglesia (idempotencia vs `ID_CONFLICT`). */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.servicePlanItem.findUnique({ where: { id } });
  }

  async nextPosition(churchId: string, tx: Tx): Promise<number> {
    const last = await tx.servicePlanItem.findFirst({
      where: { churchId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? -1) + 1;
  }

  create(
    churchId: string,
    id: string | undefined,
    kind: PlanItemKind,
    refId: string,
    position: number,
    tx: Tx,
  ) {
    return tx.servicePlanItem.create({
      data: { id, churchId, kind, refId, position },
    });
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.servicePlanItem.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }

  async clearActive(churchId: string, tx: Tx): Promise<void> {
    await tx.servicePlanItem.updateMany({
      where: { churchId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /** Mueve `id` a `position` y recorre los demas para no dejar huecos ni choques. */
  async move(
    churchId: string,
    id: string,
    position: number,
    tx: Tx,
  ): Promise<void> {
    const items = await tx.servicePlanItem.findMany({
      where: { churchId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    const from = items.findIndex((item) => item.id === id);
    if (from === -1) return;

    const [moved] = items.splice(from, 1);
    const to = Math.min(Math.max(position, 0), items.length);
    items.splice(to, 0, moved);

    await Promise.all(
      items.map((item, index) =>
        item.position === index
          ? Promise.resolve()
          : tx.servicePlanItem.update({
              where: { id: item.id },
              data: { position: index },
            }),
      ),
    );
  }

  /**
   * Limpieza en cascada (sin llave foranea, como `projectionDefaultBackground`):
   * al borrarse la cancion o el medio referenciado, esto borra (suave) las filas
   * que lo referenciaban, para que el plan nunca quede con una referencia colgando.
   * Corre dentro de la transaccion de quien borra la cancion/medio (ya tiene el candado).
   */
  async softDeleteByRef(
    churchId: string,
    kind: PlanItemKind,
    refId: string,
    tx: Tx,
  ): Promise<void> {
    await tx.servicePlanItem.updateMany({
      where: { churchId, kind, refId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
