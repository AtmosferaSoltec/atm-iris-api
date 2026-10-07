import type { Church as ChurchRow } from '../../generated/prisma/client.js';
import type { Church, ChurchModules } from './church.types.js';

/**
 * Fila → contrato. `usedBytes` se calcula aparte (suma de los medios no
 * borrados) porque no es una columna. Los BigInt pasan a number: 2^53 bytes son
 * 8 PiB, lejos de cualquier cuota.
 */
export function toChurch(
  row: ChurchRow,
  usedBytes: bigint | number,
  available: ChurchModules = { bible: true, multimedia: true, timeControl: true },
): Church {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    // Lo apagado para todo Iris queda apagado aunque la iglesia lo tenga encendido;
    // su eleccion se conserva y vuelve sola cuando el modulo se habilita otra vez.
    modules: {
      bible: row.bibleEnabled && available.bible,
      multimedia: row.multimediaEnabled && available.multimedia,
      timeControl: row.timeControlEnabled && available.timeControl,
    },
    availableModules: available,
    projection: {
      fontFamily: row.projectionFontFamily,
      fontSizePt: row.projectionFontSizePt,
      defaultBackgroundId: row.projectionDefaultBackground,
    },
    storage: {
      usedBytes: Number(usedBytes),
      quotaBytes: Number(row.storageQuotaBytes),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
