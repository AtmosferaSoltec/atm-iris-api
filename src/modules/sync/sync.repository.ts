import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { SyncCandidate, SyncEntityType } from './sync.types.js';

type CandidateRow = {
  type: SyncEntityType;
  id: string;
  sync_version: bigint;
  is_deleted: boolean;
};

@Injectable()
export class SyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las filas de la iglesia con version mayor al cursor, de todas las tablas
   * sincronizables, en orden de version. Cada rama ordena y corta por su lado
   * para que use su indice `(church_id, sync_version)`; la union vuelve a
   * ordenar y corta en `take` (que el servicio pide con uno de mas para saber
   * si hay otra pagina).
   */
  async findCandidates(
    churchId: string,
    since: bigint,
    take: number,
  ): Promise<SyncCandidate[]> {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      SELECT type, id, sync_version, is_deleted FROM (
        (SELECT 'people' AS type, id, sync_version, deleted_at IS NOT NULL AS is_deleted
           FROM people WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
        UNION ALL
        (SELECT 'serviceTypes', id, sync_version, deleted_at IS NOT NULL
           FROM service_types WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
        UNION ALL
        (SELECT 'songs', id, sync_version, deleted_at IS NOT NULL
           FROM songs WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
        UNION ALL
        (SELECT 'media', id, sync_version, deleted_at IS NOT NULL
           FROM media_assets WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
        UNION ALL
        (SELECT 'serviceRecords', id, sync_version, deleted_at IS NOT NULL
           FROM service_records WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
        UNION ALL
        (SELECT 'servicePlan', id, sync_version, deleted_at IS NOT NULL
           FROM service_plan_items WHERE church_id = ${churchId} AND sync_version > ${since}
           ORDER BY sync_version LIMIT ${take})
      ) AS candidates
      ORDER BY sync_version
      LIMIT ${take}`;

    return rows.map((row) => ({
      type: row.type,
      id: row.id,
      version: row.sync_version,
      isDeleted: row.is_deleted,
    }));
  }

  async churchVersion(churchId: string): Promise<bigint> {
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
      select: { syncVersion: true },
    });
    return church?.syncVersion ?? 0n;
  }
}
