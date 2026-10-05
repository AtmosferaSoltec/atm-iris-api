import type {
  BibleBook as BibleBookRow,
  BibleTranslation as BibleTranslationRow,
} from '../../generated/prisma/client.js';
import type { BibleBook, BibleTranslation } from './bible.types.js';

export function toBibleTranslation(row: BibleTranslationRow): BibleTranslation {
  return {
    code: row.code,
    name: row.name,
    language: row.language as 'es',
    version: row.version,
    sizeBytes: row.sizeBytes,
  };
}

export function toBibleBook(row: BibleBookRow): BibleBook {
  return {
    id: row.id,
    name: row.name,
    testament: row.testament === 'OLD' ? 'old' : 'new',
    chapterCount: row.chapterCount,
    position: row.position,
  };
}
