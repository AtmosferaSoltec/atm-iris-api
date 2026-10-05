import { Injectable } from '@nestjs/common';

import { ChurchWriteLock } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class ChurchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  findChurch(churchId: string) {
    return this.prisma.church.findUnique({ where: { id: churchId } });
  }

  /** Bytes ocupados por los medios no borrados de la iglesia. */
  async usedStorageBytes(churchId: string): Promise<bigint> {
    const result = await this.prisma.mediaAsset.aggregate({
      where: { churchId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0n;
  }

  /** Bajo el candado: `churches` es sincronizable (cambios de nombre y modulos). */
  updateChurch(churchId: string, data: Prisma.ChurchUpdateInput) {
    return this.lock.run(churchId, (tx) =>
      tx.church.update({ where: { id: churchId }, data }),
    );
  }
}
