import { gzipSync } from 'node:zlib';

import type { BibleBook, BibleDownload } from './bible.types.js';

type VerseRow = { bookId: string; chapter: number; verse: number; text: string };

/**
 * Arma la descarga completa (`chapters[c][v]`). Funcion pura: la usan el API
 * al servir `download` y el script de importacion para calcular `size_bytes`,
 * asi los dos miden exactamente el mismo JSON.
 */
export function buildBibleDownload(
  translation: { code: string; name: string; version: number },
  books: BibleBook[],
  verses: VerseRow[],
): BibleDownload {
  const chaptersByBook = new Map<string, string[][]>();
  for (const book of books) {
    chaptersByBook.set(
      book.id,
      Array.from({ length: book.chapterCount }, () => []),
    );
  }

  for (const verse of verses) {
    const chapter = chaptersByBook.get(verse.bookId)?.[verse.chapter - 1];
    if (chapter) chapter[verse.verse - 1] = verse.text;
  }

  return {
    code: translation.code,
    name: translation.name,
    version: translation.version,
    books: [...books]
      .sort((a, b) => a.position - b.position)
      // Campos explicitos y en orden fijo: el script y el API arman el mismo JSON
      // byte a byte, y `size_bytes` coincide con lo que se descarga.
      .map((book) => ({
        id: book.id,
        name: book.name,
        testament: book.testament,
        chapterCount: book.chapterCount,
        position: book.position,
        // Un hueco en la numeracion queda como texto vacio y no como `null`.
        chapters: (chaptersByBook.get(book.id) ?? []).map((chapter) =>
          Array.from(chapter, (text) => text ?? ''),
        ),
      })),
  };
}

/** El cuerpo tal como viaja: `{ data: BibleDownload }` comprimido con gzip. */
export function gzipBibleDownload(download: BibleDownload): Buffer {
  return gzipSync(JSON.stringify({ data: download }), { level: 9 });
}
