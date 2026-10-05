/**
 * Importa la Reina-Valera 1909 (dominio publico) desde el archivo VPL de
 * eBible.org. Fuente, licencia y fecha de descarga: docs/bible-source.md.
 *
 * Uso:
 *   pnpm db:import-bible data/bible/spaRV1909_vpl.txt           # si ya existe, no hace nada
 *   pnpm db:import-bible data/bible/spaRV1909_vpl.txt --force   # reemplaza todo y sube la version
 *
 * El formato VPL es una linea por versiculo: `GEN 1:1 EN el principio...`.
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { BIBLE_BOOKS } from '../src/modules/bible/bible.books.js';
import {
  buildBibleDownload,
  gzipBibleDownload,
} from '../src/modules/bible/bible.download.js';

const TRANSLATION = { code: 'rvr1909', name: 'Reina-Valera 1909', language: 'es' };
const BATCH = 2000;

const [path, ...flags] = process.argv.slice(2);
const force = flags.includes('--force');

if (!path) {
  console.error('Uso: pnpm db:import-bible <ruta a spaRV1909_vpl.txt> [--force]');
  process.exit(1);
}

type Verse = { bookId: string; chapter: number; verse: number; text: string };

/** Lee el VPL y traduce los codigos de libro de eBible a USFM. */
function parse(file: string): Verse[] {
  const byVplCode = new Map(BIBLE_BOOKS.map((book) => [book.vpl ?? book.id, book.id]));
  const line = /^(\S+) (\d+):(\d+)(?: (.*))?$/;

  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((row) => row.trim())
    .map((row, index) => {
      const match = line.exec(row);
      if (!match) throw new Error(`Linea ${index + 1} con formato inesperado: ${row.slice(0, 60)}`);

      const bookId = byVplCode.get(match[1]!);
      if (!bookId) throw new Error(`Libro desconocido en la linea ${index + 1}: ${match[1]}`);

      return {
        bookId,
        chapter: Number(match[2]),
        verse: Number(match[3]),
        text: (match[4] ?? '').trim(),
      };
    });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }, { schema: 'iris' }),
});

try {
  const existing = await prisma.bibleTranslation.findUnique({
    where: { code: TRANSLATION.code },
  });

  if (existing && !force) {
    console.log(
      `${TRANSLATION.name} ya esta importada (version ${existing.version}); no se cambio nada. ` +
        'Usa --force para reemplazarla.',
    );
  } else {
    const verses = parse(path);
    const books = BIBLE_BOOKS.map((book, index) => ({
      id: book.id,
      name: book.name,
      testament: book.testament,
      position: index + 1,
      chapterCount: Math.max(
        0,
        ...verses.filter((v) => v.bookId === book.id).map((v) => v.chapter),
      ),
    }));

    const missing = books.filter((book) => book.chapterCount === 0);
    if (missing.length > 0) {
      throw new Error(`El archivo no trae estos libros: ${missing.map((b) => b.id).join(', ')}`);
    }

    const version = (existing?.version ?? 0) + 1;
    const sizeBytes = gzipBibleDownload(
      buildBibleDownload({ ...TRANSLATION, version }, books, verses),
    ).length;

    await prisma.$transaction(
      async (tx) => {
        // Los libros y versiculos caen en cascada.
        await tx.bibleTranslation.deleteMany({ where: { code: TRANSLATION.code } });
        await tx.bibleTranslation.create({ data: { ...TRANSLATION, version, sizeBytes } });
        await tx.bibleBook.createMany({
          data: books.map((book) => ({
            translationCode: TRANSLATION.code,
            ...book,
            testament: book.testament === 'old' ? ('OLD' as const) : ('NEW' as const),
          })),
        });
        for (let start = 0; start < verses.length; start += BATCH) {
          await tx.bibleVerse.createMany({
            data: verses
              .slice(start, start + BATCH)
              .map((verse) => ({ translationCode: TRANSLATION.code, ...verse })),
          });
        }
      },
      { timeout: 5 * 60 * 1000 },
    );

    console.log(`${TRANSLATION.name} importada (version ${version}).`);
  }

  // Comprobacion: 66 libros, 1189 capitulos, ~31 100 versiculos.
  const [bookCount, chapters, verseCount] = await Promise.all([
    prisma.bibleBook.count({ where: { translationCode: TRANSLATION.code } }),
    prisma.bibleBook.aggregate({
      where: { translationCode: TRANSLATION.code },
      _sum: { chapterCount: true },
    }),
    prisma.bibleVerse.count({ where: { translationCode: TRANSLATION.code } }),
  ]);
  console.log(
    `Libros: ${bookCount} · capitulos: ${chapters._sum.chapterCount ?? 0} · versiculos: ${verseCount}`,
  );
} finally {
  await prisma.$disconnect();
}
