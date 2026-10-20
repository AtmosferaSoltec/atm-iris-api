import type { Church as ChurchRow } from '../../generated/prisma/client.js';
import type { StorageBreakdownBytes } from './church.repository.js';
import { STORAGE_QUOTA_BYTES } from './storage.js';
import type { Church } from './church.types.js';

const NO_USAGE: StorageBreakdownBytes = {
  music: 0n,
  backgrounds: 0n,
  media: 0n,
};

/**
 * Fila → contrato. Lo usado se calcula aparte (suma de los medios no borrados,
 * por seccion) porque no es una columna. Los BigInt pasan a number: 2^53 bytes
 * son 8 PiB, lejos de cualquier cuota.
 */
export function toChurch(
  row: ChurchRow,
  usage: StorageBreakdownBytes = NO_USAGE,
): Church {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    projection: {
      fontFamily: row.projectionFontFamily,
      fontSizePt: row.projectionFontSizePt,
      defaultBackgroundId: row.projectionDefaultBackground,
    },
    storage: {
      usedBytes: Number(usage.music + usage.backgrounds + usage.media),
      quotaBytes: Number(STORAGE_QUOTA_BYTES),
      breakdown: {
        musicBytes: Number(usage.music),
        backgroundBytes: Number(usage.backgrounds),
        mediaBytes: Number(usage.media),
      },
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
