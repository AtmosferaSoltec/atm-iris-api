import type {
  MediaAsset as MediaAssetRow,
  MediaKind,
} from '../../generated/prisma/client.js';
import type { MediaAsset, MediaKindName } from './media.types.js';

export const toMediaKind = (kind: MediaKind): MediaKindName =>
  kind.toLowerCase() as MediaKindName;

export const toDbMediaKind = (kind: MediaKindName): MediaKind =>
  kind.toUpperCase() as MediaKind;

/** La clave del objeto no sale nunca: el cliente descarga por `download-url`. */
export function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    kind: toMediaKind(row.kind),
    title: row.title,
    description: row.description,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    durationSeconds: row.durationSeconds,
    width: row.width,
    height: row.height,
    isBackground: row.isBackground,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
