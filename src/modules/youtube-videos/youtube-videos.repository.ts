import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';

type Db = PrismaService | Tx;

@Injectable()
export class YoutubeVideosRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  listActive(churchId: string) {
    return this.prisma.youtubeVideo.findMany({
      where: { churchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.youtubeVideo.findFirst({
      where: { id, churchId, deletedAt: null },
    });
  }

  /** Busca el id en cualquier iglesia (idempotencia vs `ID_CONFLICT`). */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.youtubeVideo.findUnique({ where: { id } });
  }

  findActiveByVideoId(churchId: string, videoId: string, db: Db = this.prisma) {
    return db.youtubeVideo.findFirst({
      where: { churchId, videoId, deletedAt: null },
    });
  }

  create(
    churchId: string,
    data: { id?: string; videoId: string; title: string; author: string },
    tx: Tx,
  ) {
    return tx.youtubeVideo.create({ data: { churchId, ...data } });
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.youtubeVideo.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }
}
