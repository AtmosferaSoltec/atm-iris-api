import type {
  Song as SongRow,
  SongSection as SongSectionRow,
} from '../../generated/prisma/client.js';
import type { Song, SongSummary } from './songs.types.js';

export type SongWithSections = SongRow & { sections: SongSectionRow[] };

/** Lo minimo para armar un `SongSummary` sin cargar todas las secciones. */
export type SongSummaryRow = Pick<SongRow, 'id' | 'title' | 'author' | 'updatedAt'> & {
  sections: Pick<SongSectionRow, 'text'>[];
  _count: { sections: number };
};

export function toSong(row: SongWithSections): Song {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    copyright: row.copyright,
    sections: [...row.sections]
      .sort((a, b) => a.position - b.position)
      .map((section) => ({ id: section.id, label: section.label, text: section.text })),
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
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Primera linea con texto de la primera seccion: la que se ve en la lista. */
export function firstLine(text: string | undefined): string | null {
  const line = text
    ?.split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? null;
}
