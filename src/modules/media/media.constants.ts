import type { MediaKindName } from './media.types.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Tipos y maximos por `kind`: la tabla exacta del contrato §11. */
export const MEDIA_RULES: Record<
  MediaKindName,
  { contentTypes: readonly string[]; maxBytes: number }
> = {
  image: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 20 * MB,
  },
  video: {
    contentTypes: ['video/mp4', 'video/quicktime'],
    maxBytes: 2 * GB,
  },
  audio: {
    contentTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav'],
    maxBytes: 200 * MB,
  },
};

/** Vida del ticket de subida y de su URL firmada. */
export const UPLOAD_TTL_SECONDS = 60 * 60;

/** Vida de una URL de descarga. */
export const DOWNLOAD_TTL_SECONDS = 60 * 60;

/**
 * Cuanto se espera tras el borrado suave antes de borrar el archivo del
 * almacenamiento: da tiempo a que las consolas sincronicen el borrado en lugar
 * de encontrarse con descargas rotas.
 */
export const PURGE_AFTER_HOURS = 24;
