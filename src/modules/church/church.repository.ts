import { Injectable } from '@nestjs/common';

import { ChurchWriteLock } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type StorageBreakdownBytes = { music: bigint; backgrounds: bigint; media: bigint };

@Injectable()
export class ChurchRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  findChurch(churchId: string) {
    return this.prisma.church.findUnique({ where: { id: churchId } });
  }

  /** Bytes ocupados por los medios no borrados de la iglesia, por seccion. */
  async storageBreakdown(churchId: string): Promise<StorageBreakdownBytes> {
    const groups = await this.prisma.mediaAsset.groupBy({
      by: ['kind', 'isBackground'],
      where: { churchId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    const usage: StorageBreakdownBytes = { music: 0n, backgrounds: 0n, media: 0n };
    for (const group of groups) {
      const bytes = group._sum.sizeBytes ?? 0n;
      if (group.kind === 'AUDIO') usage.music += bytes;
      else if (group.isBackground) usage.backgrounds += bytes;
      else usage.media += bytes;
    }
    return usage;
  }

  /** Bajo el candado: `churches` es sincronizable (cambios de nombre y modulos). */
  updateChurch(churchId: string, data: Prisma.ChurchUpdateInput) {
    return this.lock.run(churchId, (tx) =>
      tx.church.update({ where: { id: churchId }, data }),
    );
  }
}
