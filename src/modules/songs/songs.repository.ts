import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SongInput } from './dto/songs.schema.js';

type Db = PrismaService | Tx;

const WITH_SECTIONS = { sections: { orderBy: { position: 'asc' } } } as const;

/** Lo que pide un `SongSummary`: la primera seccion y el conteo, no todas. */
const SUMMARY_SELECT = {
  id: true,
  title: true,
  author: true,
  updatedAt: true,
  sections: { where: { position: 0 }, select: { text: true } },
  _count: { select: { sections: true } },
} as const;

/** Columnas calculadas que el servicio entrega ya listas. */
export type SongKeys = { titleKey: string; searchText: string };

@Injectable()
export class SongsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: ChurchWriteLock,
  ) {}

  withLock<T>(churchId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.lock.run(churchId, work);
  }

  listSummaries(
    churchId: string,
    sort: 'title' | '-updatedAt',
    page: { skip: number; take: number },
  ) {
    return this.prisma.song.findMany({
      where: { churchId, deletedAt: null },
      select: SUMMARY_SELECT,
      orderBy:
        sort === '-updatedAt'
          ? [{ updatedAt: 'desc' }, { id: 'asc' }]
          : [{ titleKey: 'asc' }, { id: 'asc' }],
      ...page,
    });
  }

  countActive(churchId: string): Promise<number> {
    return this.prisma.song.count({ where: { churchId, deletedAt: null } });
  }

  /**
   * Busqueda sin acentos ni mayusculas: `query` ya viene normalizada con
   * `nameKey`, igual que `search_text`. Encuentra por subcadena (ILIKE) o por
   * parecido (trigramas, para errores de tipeo). Primero las que coinciden en
   * el titulo, luego por parecido y por titulo.
   *
   * `word_similarity` y no `similarity`: la segunda compara la consulta con la
   * letra entera, y una palabra contra cien lineas siempre da un puntaje casi
   * nulo. La primera la compara con el tramo del texto que mas se le parece.
   */
  async searchIds(
    churchId: string,
    query: string,
    page: { skip: number; take: number },
  ): Promise<{ ids: string[]; total: number }> {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const where = Prisma.sql`
      church_id = ${churchId}
      AND deleted_at IS NULL
      AND (search_text ILIKE ${pattern} OR word_similarity(${query}, search_text) > 0.6)`;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM songs
        WHERE ${where}
        ORDER BY (title_key ILIKE ${pattern}) DESC,
                 word_similarity(${query}, search_text) DESC,
                 title_key ASC,
                 id ASC
        LIMIT ${page.take} OFFSET ${page.skip}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM songs WHERE ${where}`,
    ]);

    return { ids: rows.map((row) => row.id), total: Number(counted[0]?.total ?? 0) };
  }

  findSummariesByIds(churchId: string, ids: string[]) {
    return this.prisma.song.findMany({
      where: { churchId, id: { in: ids } },
      select: SUMMARY_SELECT,
    });
  }

  findActive(churchId: string, id: string, db: Db = this.prisma) {
    return db.song.findFirst({
      where: { id, churchId, deletedAt: null },
      include: WITH_SECTIONS,
    });
  }

  /** Para la sincronizacion: incluye borradas. */
  findManyByIds(churchId: string, ids: string[]) {
    return this.prisma.song.findMany({
      where: { churchId, id: { in: ids } },
      include: WITH_SECTIONS,
    });
  }

  /** Busca el id en cualquier iglesia (idempotencia vs `ID_CONFLICT`). */
  findAnyById(id: string, db: Db = this.prisma) {
    return db.song.findUnique({ where: { id }, include: WITH_SECTIONS });
  }

  /** Titulos (por nameKey) que ya existen entre las canciones no borradas. */
  async findExistingTitleKeys(
    churchId: string,
    keys: string[],
    db: Db = this.prisma,
  ): Promise<Set<string>> {
    const rows = await db.song.findMany({
      where: { churchId, deletedAt: null, titleKey: { in: keys } },
      select: { titleKey: true },
    });
    return new Set(rows.map((row) => row.titleKey));
  }

  create(
    churchId: string,
    id: string | undefined,
    input: SongInput,
    keys: SongKeys,
    tx: Tx,
  ) {
    return tx.song.create({
      data: {
        id,
        churchId,
        ...columns(input, keys),
        sections: { create: sectionRows(input) },
      },
      include: WITH_SECTIONS,
    });
  }

  /**
   * Reemplazo completo: las secciones se borran y se crean de nuevo, en orden.
   * Actualizar el padre mueve `updated_at` y sube la version.
   */
  async replace(
    churchId: string,
    id: string,
    input: SongInput,
    keys: SongKeys,
    tx: Tx,
  ) {
    await tx.songSection.deleteMany({ where: { songId: id } });
    return tx.song.update({
      where: { id, churchId },
      data: {
        ...columns(input, keys),
        updatedAt: new Date(),
        sections: { create: sectionRows(input) },
      },
      include: WITH_SECTIONS,
    });
  }

  async softDelete(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.song.update({
      where: { id, churchId },
      data: { deletedAt: new Date() },
    });
  }
}

function columns(input: SongInput, keys: SongKeys) {
  return {
    title: input.title,
    titleKey: keys.titleKey,
    author: input.author,
    copyright: input.copyright,
    searchText: keys.searchText,
  };
}

function sectionRows(input: SongInput) {
  return input.sections.map((section, position) => ({
    position,
    label: section.label,
    text: section.text,
  }));
}
