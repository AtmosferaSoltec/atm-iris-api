import { Injectable } from '@nestjs/common';

import { ChurchWriteLock, type Tx } from '../../database/church-write-lock.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SongInput } from './dto/songs.schema.js';

type Db = PrismaService | Tx;

const WITH_SECTIONS = {
  sections: { orderBy: { position: 'asc' } },
  audio: true,
} as const;

/** Lo que pide un `SongSummary`: la primera seccion y el conteo, no todas. */
const SUMMARY_SELECT = {
  id: true,
  title: true,
  author: true,
  youtubeId: true,
  backgroundId: true,
  archivedAt: true,
  lastUsedAt: true,
  updatedAt: true,
  sections: { where: { position: 0 }, select: { text: true } },
  audio: true,
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
    archived: boolean,
    page: { skip: number; take: number },
  ) {
    return this.prisma.song.findMany({
      where: {
        churchId,
        deletedAt: null,
        archivedAt: archivedFilter(archived),
      },
      select: SUMMARY_SELECT,
      orderBy:
        sort === '-updatedAt'
          ? [{ updatedAt: 'desc' }, { id: 'asc' }]
          : [{ titleKey: 'asc' }, { id: 'asc' }],
      ...page,
    });
  }

  countActive(churchId: string, archived: boolean): Promise<number> {
    return this.prisma.song.count({
      where: {
        churchId,
        deletedAt: null,
        archivedAt: archivedFilter(archived),
      },
    });
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
    archived: boolean,
    page: { skip: number; take: number },
  ): Promise<{ ids: string[]; total: number }> {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const where = Prisma.sql`
      church_id = ${churchId}
      AND deleted_at IS NULL
      AND ${archived ? Prisma.sql`archived_at IS NOT NULL` : Prisma.sql`archived_at IS NULL`}
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

    return {
      ids: rows.map((row) => row.id),
      total: Number(counted[0]?.total ?? 0),
    };
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

  /** Se uso (se agrego al plan): cuenta como reciente y sale del archivo. */
  async markUsed(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.song.updateMany({
      where: { id, churchId, deletedAt: null },
      data: { lastUsedAt: new Date(), archivedAt: null },
    });
  }

  /**
   * Canciones sin uso desde `before` que no estan en el plan del servicio (una
   * que sigue ahi se esta usando, aunque la hayan agregado hace tiempo).
   */
  findStale(before: Date, take: number) {
    return this.prisma.$queryRaw<{ id: string; churchId: string }[]>`
      SELECT s.id, s.church_id AS "churchId" FROM songs s
      WHERE s.deleted_at IS NULL
        AND s.archived_at IS NULL
        AND COALESCE(s.last_used_at, s.created_at) < ${before}
        AND NOT EXISTS (
          SELECT 1 FROM service_plan_items p
          WHERE p.ref_id = s.id AND p.kind = 'SONG' AND p.deleted_at IS NULL)
      ORDER BY COALESCE(s.last_used_at, s.created_at)
      LIMIT ${take}`;
  }

  async archive(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.song.update({
      where: { id, churchId },
      data: { archivedAt: new Date(), audioId: null },
    });
  }

  async unarchive(churchId: string, id: string, tx: Tx): Promise<void> {
    await tx.song.update({
      where: { id, churchId },
      data: { archivedAt: null, lastUsedAt: new Date() },
    });
  }

  /** La cancion (de cualquier estado) que ya usa esa pista, si hay una. */
  findByAudioId(audioId: string, db: Db = this.prisma) {
    return db.song.findUnique({
      where: { audioId },
      select: { id: true, churchId: true },
    });
  }
}

/** `true`: solo las archivadas; `false`: solo las de la biblioteca. */
const archivedFilter = (archived: boolean) => (archived ? { not: null } : null);

function columns(input: SongInput, keys: SongKeys) {
  return {
    title: input.title,
    titleKey: keys.titleKey,
    author: input.author,
    audioId: input.audioId,
    youtubeId: input.youtubeId,
    // Omitido en un reemplazo: se queda el que tenia (un cliente que no lo
    // conoce no lo borra).
    ...(input.backgroundId !== undefined
      ? { backgroundId: input.backgroundId }
      : {}),
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
