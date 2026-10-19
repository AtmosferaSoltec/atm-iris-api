import type { MediaAsset } from '../media/media.types.js';

/** Contrato §10. */
export type SongSection = { id: string; label: string | null; text: string };

export type Song = {
  id: string;
  title: string;
  author: string;
  /** Vacio si la cancion es solo pista. */
  sections: SongSection[];
  /** La pista (un audio de §11); `null` si es solo letra. */
  audio: MediaAsset | null;
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
  updatedAt: string;
};
