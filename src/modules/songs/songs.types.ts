import type { MediaAsset } from '../media/media.types.js';

/** Contrato §10. */
export type SongSection = { id: string; label: string | null; text: string };

export type Song = {
  id: string;
  title: string;
  author: string;
  /** Vacio si la cancion es solo pista. */
  sections: SongSection[];
  /** La pista (un audio de §11); `null` si es solo letra o si esta en YouTube. */
  audio: MediaAsset | null;
  /** La pista en YouTube: el id del video. */
  youtubeId: string | null;
  /** El enlace era de YouTube Music (solo musica), no de YouTube (con video). */
  youtubeMusic: boolean;
  /** Su fondo (un medio de fondo de §11); la consola lo pone al presentarla. */
  backgroundId: string | null;
  /** Archivada: fuera de la biblioteca, sin su pista subida. */
  archivedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SongSummary = {
  id: string;
  title: string;
  author: string;
  sectionCount: number;
  firstLine: string | null;
  audio: MediaAsset | null;
  youtubeId: string | null;
  youtubeMusic: boolean;
  backgroundId: string | null;
  archivedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
};
