import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

/** Contenido global: aqui no hay `churchId`, el texto es el mismo para todos. */
@Injectable()
export class BibleRepository {
  constructor(private readonly prisma: PrismaService) {}

  listTranslations() {
    return this.prisma.bibleTranslation.findMany({ orderBy: { code: 'asc' } });
  }

  findTranslation(code: string) {
    return this.prisma.bibleTranslation.findUnique({ where: { code } });
  }

  listBooks(code: string) {
    return this.prisma.bibleBook.findMany({
      where: { translationCode: code },
      orderBy: { position: 'asc' },
    });
  }

  findChapter(code: string, bookId: string, chapter: number) {
    return this.prisma.bibleVerse.findMany({
      where: { translationCode: code, bookId, chapter },
      orderBy: { verse: 'asc' },
      select: { verse: true, text: true },
    });
  }

  /** Los ~31 000 versiculos, para armar la descarga (se cachea en memoria). */
  listAllVerses(code: string) {
    return this.prisma.bibleVerse.findMany({
      where: { translationCode: code },
      select: { bookId: true, chapter: true, verse: true, text: true },
    });
  }
}
