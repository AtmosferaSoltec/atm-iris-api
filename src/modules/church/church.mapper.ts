import type { Church as ChurchRow } from '../../generated/prisma/client.js';
import type { Church } from './church.types.js';

/**
 * Fila → contrato. `usedBytes` se calcula aparte (suma de los medios no
 * borrados) porque no es una columna. Los BigInt pasan a number: 2^53 bytes son
 * 8 PiB, lejos de cualquier cuota.
 */
export function toChurch(row: ChurchRow, usedBytes: bigint | number): Church {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    modules: {
      bible: row.bibleEnabled,
      multimedia: row.multimediaEnabled,
      timeControl: row.timeControlEnabled,
    },
    storage: {
      usedBytes: Number(usedBytes),
      quotaBytes: Number(row.storageQuotaBytes),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
