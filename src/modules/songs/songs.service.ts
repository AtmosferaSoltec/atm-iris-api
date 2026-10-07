import { Injectable } from '@nestjs/common';

import {
  pageWindow,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.schema.js';
import { idConflict, notFound } from '../../common/exceptions/api-errors.js';
import { PlanItemKind } from '../../generated/prisma/client.js';
import { nameKey, searchText } from '../../shared/utils/text.js';
import { ServicePlanRepository } from '../service-plan/service-plan.repository.js';
import type {
  CreateSongInput,
  ListSongsQuery,
  SongInput,
} from './dto/songs.schema.js';
import { toSong, toSongSummary } from './songs.mapper.js';
import { SongsRepository, type SongKeys } from './songs.repository.js';
import type { Song, SongSummary } from './songs.types.js';

export type SavedSong = { song: Song; isNew: boolean };

@Injectable()
export class SongsService {
  constructor(
    private readonly repository: SongsRepository,
    private readonly servicePlan: ServicePlanRepository,
  ) {}

  async list(
    churchId: string,
    query: ListSongsQuery,
  ): Promise<Paginated<SongSummary>> {
    const window = pageWindow(query);
    const search = query.search ? nameKey(query.search) : '';

    if (!search) {
      const [rows, total] = await Promise.all([
        this.repository.listSummaries(churchId, query.sort ?? 'title', window),
        this.repository.countActive(churchId),
      ]);
      return paginate(rows.map(toSongSummary), total, query.page, query.limit);
    }

    // Con busqueda manda la relevancia: se piden los ids ya ordenados y luego
    // se cargan los resumenes respetando ese orden.
    const { ids, total } = await this.repository.searchIds(
      churchId,
      search,
      window,
    );
    const rows = await this.repository.findSummariesByIds(churchId, ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toSongSummary(row)] : [];
    });

    return paginate(ordered, total, query.page, query.limit);
  }

  async get(churchId: string, id: string): Promise<Song> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw songNotFound();
    return toSong(row);
  }

  /** Idempotente por `id`: un reintento devuelve la cancion ya creada (200). */
  create(churchId: string, input: CreateSongInput): Promise<SavedSong> {
    return this.repository.withLock(churchId, async (tx) => {
      if (input.id) {
        const existing = await this.repository.findAnyById(input.id, tx);
        if (existing) {
          if (existing.churchId !== churchId) throw idConflict();
          return { song: toSong(existing), isNew: false };
        }
      }

      const row = await this.repository.create(
        churchId,
        input.id,
        input,
        keysOf(input),
        tx,
      );
      return { song: toSong(row), isNew: true };
    });
  }

  /** Reemplazo completo; crea si no existe. Una cancion borrada no revive (404). */
  replace(churchId: string, id: string, input: SongInput): Promise<SavedSong> {
    return this.repository.withLock(churchId, async (tx) => {
      const existing = await this.repository.findAnyById(id, tx);
      if (existing && existing.churchId !== churchId) throw idConflict();
      if (existing?.deletedAt) throw songNotFound();

      if (!existing) {
        const row = await this.repository.create(
          churchId,
          id,
          input,
          keysOf(input),
          tx,
        );
        return { song: toSong(row), isNew: true };
      }

      const row = await this.repository.replace(
        churchId,
        id,
        input,
        keysOf(input),
        tx,
      );
      return { song: toSong(row), isNew: false };
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw songNotFound();
      await this.repository.softDelete(churchId, id, tx);
      // Sin esto, el plan adelantado quedaria con una referencia colgando.
      await this.servicePlan.softDeleteByRef(
        churchId,
        PlanItemKind.SONG,
        id,
        tx,
      );
    });
  }
}

function keysOf(input: SongInput): SongKeys {
  return {
    titleKey: nameKey(input.title),
    searchText: searchText(
      input.title,
      input.author,
      ...input.sections.map((section) => section.text),
    ),
  };
}

const songNotFound = () => notFound('Esa canción no existe.');
