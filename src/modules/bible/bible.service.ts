import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/exceptions/api-errors.js';
import { buildBibleDownload, gzipBibleDownload } from './bible.download.js';
import { toBibleBook, toBibleTranslation } from './bible.mapper.js';
import { BibleRepository } from './bible.repository.js';
import type { BibleBook, BibleChapter, BibleTranslation } from './bible.types.js';

export type CachedDownload = { etag: string; body: Buffer };

@Injectable()
export class BibleService {
  /**
   * Descargas ya comprimidas, por `code-version`. Armarla lee 31 000 filas y
   * comprime ~4 MB: se hace una vez por version y proceso, no en cada consola.
   */
  private readonly downloads = new Map<string, Promise<CachedDownload>>();

  constructor(private readonly repository: BibleRepository) {}

  async listTranslations(): Promise<BibleTranslation[]> {
    const rows = await this.repository.listTranslations();
    return rows.map(toBibleTranslation);
  }

  async listBooks(code: string): Promise<BibleBook[]> {
    await this.translation(code);
    const rows = await this.repository.listBooks(code);
    return rows.map(toBibleBook);
  }

  async getChapter(code: string, bookId: string, chapter: number): Promise<BibleChapter> {
    const verses = await this.repository.findChapter(code, bookId, chapter);
    if (verses.length === 0) throw notFound('Ese capítulo no existe.');

    return {
      bookId,
      chapter,
      verses: verses.map((verse) => ({ number: verse.verse, text: verse.text })),
    };
  }

  /** La traduccion completa, comprimida, con su ETag `"<code>-<version>"`. */
  async getDownload(code: string): Promise<CachedDownload> {
    const translation = await this.translation(code);
    const key = `${translation.code}-${translation.version}`;

    let cached = this.downloads.get(key);
    if (!cached) {
      cached = this.build(translation, key);
      // Una version nueva reemplaza a las anteriores: no tiene sentido guardarlas.
      this.downloads.clear();
      this.downloads.set(key, cached);
      // Si falla, que el proximo intento vuelva a armarla.
      cached.catch(() => this.downloads.delete(key));
    }
    return cached;
  }

  private async build(
    translation: { code: string; name: string; version: number },
    key: string,
  ): Promise<CachedDownload> {
    const [books, verses] = await Promise.all([
      this.repository.listBooks(translation.code),
      this.repository.listAllVerses(translation.code),
    ]);
    const download = buildBibleDownload(translation, books.map(toBibleBook), verses);
    return { etag: `"${key}"`, body: gzipBibleDownload(download) };
  }

  private async translation(code: string) {
    const row = await this.repository.findTranslation(code);
    if (!row) throw notFound('Esa traducción no existe.');
    return row;
  }
}
