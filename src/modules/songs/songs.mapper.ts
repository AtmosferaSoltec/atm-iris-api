import type {
  MediaAsset as MediaAssetRow,
  Song as SongRow,
  SongSection as SongSectionRow,
} from '../../generated/prisma/client.js';
import { toMediaAsset } from '../media/media.mapper.js';
import type { MediaAsset } from '../media/media.types.js';
import type { Song, SongSummary } from './songs.types.js';

export type SongWithSections = SongRow & {
  sections: SongSectionRow[];
  audio: MediaAssetRow | null;
};

/** Lo minimo para armar un `SongSummary` sin cargar todas las secciones. */
export type SongSummaryRow = Pick<
  SongRow,
  'id' | 'title' | 'author' | 'updatedAt'
> & {
  sections: Pick<SongSectionRow, 'text'>[];
  audio: MediaAssetRow | null;
  _count: { sections: number };
};

export function toSong(row: SongWithSections): Song {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    sections: [...row.sections]
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        id: section.id,
        label: section.label,
        text: section.text,
      })),
    audio: toAudio(row.audio),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSongSummary(row: SongSummaryRow): SongSummary {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    sectionCount: row._count.sections,
    firstLine: firstLine(row.sections[0]?.text),
    audio: toAudio(row.audio),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Una pista borrada (y aun no desvinculada) ya no cuenta. */
function toAudio(row: MediaAssetRow | null): MediaAsset | null {
  return row && !row.deletedAt ? toMediaAsset(row) : null;
}

/** Primera linea con texto de la primera seccion: la que se ve en la lista. */
export function firstLine(text: string | undefined): string | null {
  const line = text
    ?.split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? null;
}
