import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaKind, Prisma } from '../../generated/prisma/client.js';

type Db = PrismaService | Tx;

export type NewUpload = {
  kind: MediaKind;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  objectKey: string;
  expiresAt: Date;
  createdByUserId: string;
};

export type ConfirmedMedia = {
  title: string;
  titleKey: string;
  description: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isBackground: boolean;
};

export type MediaFilters = {
  kinds?: MediaKind[];
  titleKey?: string;
  isBackground?: boolean;
};

@Injectable()
export class MediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  /** Serializa la reserva de cuota y las escrituras de medios de la iglesia. */
  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  async quotaBytes(churchId: string, db: Db = this.prisma): Promise<bigint> {
    const church = await db.church.findUnique({
      where: { id: churchId },
      select: { storageQuotaBytes: true },
    });
    return church?.storageQuotaBytes ?? 0n;
  }

  /** Lo que ya ocupa la iglesia: medios no borrados. */
  async usedBytes(churchId: string, db: Db = this.prisma): Promise<bigint> {
    const result = await db.mediaAsset.aggregate({
      where: { churchId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0n;
  }

  /** Lo reservado por subidas en curso (sin confirmar y sin vencer). */
  async pendingBytes(churchId: string, db: Db = this.prisma): Promise<bigint> {
    const result = await db.mediaUpload.aggregate({
      where: { churchId, confirmedAt: null, expiresAt: { gt: new Date() } },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0n;
  }

  createUpload(churchId: string, upload: NewUpload & { id: string }, tx: Tx) {
    return tx.mediaUpload.create({ data: { churchId, ...upload } });
  }

  findUpload(churchId: string, id: string, db: Db = this.prisma) {
    return db.mediaUpload.findFirst({ where: { id, churchId } });
  }

  /** Marca la subida y crea el medio con el mismo id, todo o nada. */
  async confirmUpload(
    churchId: string,
    upload: {
      id: string;
      kind: MediaKind;
      fileName: string;
      contentType: string;
      sizeBytes: bigint;
      objectKey: string;
    },
    media: ConfirmedMedia,
    tx: Tx,
  ) {
    await tx.mediaUpload.update({
      where: { id: upload.id, churchId },
      data: { confirmedAt: new Date() },
    });
    return tx.mediaAsset.create({
      data: {
        id: upload.id,
        churchId,
        kind: upload.kind,
        fileName: upload.fileName,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        objectKey: upload.objectKey,
        ...media,
      },
    });
  }

  list(
    churchId: string,
    filters: MediaFilters,
    page: { skip: number; take: number },
  ) {
    return this.prisma.mediaAsset.findMany({
      where: this.listWhere(churchId, filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...page,
    });
  }

  count(churchId: string, filters: MediaFilters): Promise<number> {
    return this.prisma.mediaAsset.count({ where: this.listWhere(churchId, filters) });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.mediaAsset.findFirst({ where: { id, churchId, deletedAt: null } });
  }

  findAny(churchId: string, id: string, db: Db = this.prisma) {
    return db.mediaAsset.findFirst({ where: { id, churchId } });
  }

  /** Para la sincronizacion: incluye borrados. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.mediaAsset.findMany({ where: { churchId, id: { in: ids } } });
  }

  update(
    churchId: string,
    id: string,
    data: Prisma.MediaAssetUpdateInput,
    tx: Tx,
  ) {
    return tx.mediaAsset.update({ where: { id, churchId }, data });
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.mediaAsset.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }

  /* ------------------------------------------------------------ Limpieza */
  // Las unicas consultas sin `churchId`: la tarea horaria recorre todas las
  // iglesias y solo toca archivos ya abandonados o borrados.

  findExpiredUploads(take: number) {
    return this.prisma.mediaUpload.findMany({
      where: { confirmedAt: null, expiresAt: { lt: new Date() } },
      select: { id: true, objectKey: true },
      take,
    });
  }

  async deleteUploads(ids: string[]): Promise<void> {
    await this.prisma.mediaUpload.deleteMany({
      where: { id: { in: ids }, confirmedAt: null },
    });
  }

  findAssetsToPurge(deletedBefore: Date, take: number) {
    return this.prisma.mediaAsset.findMany({
      where: { deletedAt: { lt: deletedBefore }, objectDeletedAt: null },
      select: { id: true, churchId: true, objectKey: true },
      take,
    });
  }

  /**
   * Bajo el candado de la iglesia como toda escritura en `media_assets`: el
   * trigger sube la version en cada UPDATE (el medio vuelve a salir en
   * `deleted` del feed, lo que es inofensivo) y el orden de confirmacion tiene
   * que seguir siendo el de las versiones.
   */
  async markObjectsDeleted(churchId: string, ids: string[]): Promise<void> {
    await this.lock.run(churchId, (tx) =>
      tx.mediaAsset.updateMany({
        where: { churchId, id: { in: ids } },
        data: { objectDeletedAt: new Date() },
      }),
    );
  }

  private listWhere(churchId: string, filters: MediaFilters): Prisma.MediaAssetWhereInput {
    return {
      churchId,
      deletedAt: null,
      ...(filters.kinds ? { kind: { in: filters.kinds } } : {}),
      ...(filters.isBackground !== undefined ? { isBackground: filters.isBackground } : {}),
      ...(filters.titleKey ? { titleKey: { contains: filters.titleKey } } : {}),
    };
  }
}
