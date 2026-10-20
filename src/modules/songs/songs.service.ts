import { Injectable } from '@nestjs/common';

import {
  pageWindow,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.schema.js';
import {
  idConflict,
  notFound,
  validationFailed,
} from '../../common/exceptions/api-errors.js';
import type { Tx } from '../../database/church-write-lock.js';
import { MediaKind, PlanItemKind } from '../../generated/prisma/client.js';
import { nameKey, searchText } from '../../shared/utils/text.js';
import { MediaRepository } from '../media/media.repository.js';
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
    private readonly media: MediaRepository,
  ) {}

  async list(
    churchId: string,
    query: ListSongsQuery,
  ): Promise<Paginated<SongSummary>> {
    const window = pageWindow(query);
    const search = query.search ? nameKey(query.search) : '';

    if (!search) {
      const [rows, total] = await Promise.all([
        this.repository.listSummaries(
          churchId,
          query.sort ?? 'title',
          query.archived,
          window,
        ),
        this.repository.countActive(churchId, query.archived),
      ]);
      return paginate(rows.map(toSongSummary), total, query.page, query.limit);
    }

    // Con busqueda manda la relevancia: se piden los ids ya ordenados y luego
    // se cargan los resumenes respetando ese orden.
    const { ids, total } = await this.repository.searchIds(
      churchId,
      search,
      query.archived,
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

      await this.assertAudioAvailable(churchId, input.audioId, null, tx);
      await this.assertBackground(churchId, input.backgroundId, tx);
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

      await this.assertAudioAvailable(churchId, input.audioId, id, tx);
      await this.assertBackground(churchId, input.backgroundId, tx);

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
      // La pista anterior ya no es de nadie: se borra y libera la cuota.
      if (existing.audioId && existing.audioId !== input.audioId) {
        await this.media.softDelete(churchId, existing.audioId, tx);
      }
      return { song: toSong(row), isNew: false };
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw songNotFound();
      await this.repository.softDelete(churchId, id, tx);
      // La pista es de esta cancion y de ninguna otra: se va con ella.
      if (current.audioId) {
        await this.media.softDelete(churchId, current.audioId, tx);
      }
      // Sin esto, el plan adelantado quedaria con una referencia colgando.
      await this.servicePlan.softDeleteByRef(
        churchId,
        PlanItemKind.SONG,
        id,
        tx,
      );
    });
  }

  /**
   * Archivar: la cancion sale de la biblioteca y se va su pista subida (el
   * enlace de YouTube se conserva, no ocupa espacio). La letra se queda.
   */
  archive(churchId: string, id: string): Promise<Song> {
    return this.repository.withLock(churchId, (tx) =>
      this.archiveIn(churchId, id, tx),
    );
  }

  /** Vuelve a la biblioteca. Si tenia pista subida, hay que subirla otra vez. */
  unarchive(churchId: string, id: string): Promise<Song> {
    return this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw songNotFound();
      if (current.archivedAt) await this.repository.unarchive(churchId, id, tx);
      return toSong((await this.repository.findActive(churchId, id, tx))!);
    });
  }

  /** Lo que hace el cron diario: archiva una cancion sin uso. */
  async archiveStale(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (current && !current.archivedAt)
        await this.archiveIn(churchId, id, tx);
    });
  }

  private async archiveIn(churchId: string, id: string, tx: Tx): Promise<Song> {
    const current = await this.repository.findActive(churchId, id, tx);
    if (!current) throw songNotFound();
    if (!current.archivedAt) {
      await this.repository.archive(churchId, id, tx);
      if (current.audioId) {
        await this.media.softDelete(churchId, current.audioId, tx);
      }
    }
    return toSong((await this.repository.findActive(churchId, id, tx))!);
  }

  /** El fondo tiene que ser un medio vivo de la iglesia marcado como fondo. */
  private async assertBackground(
    churchId: string,
    backgroundId: string | null | undefined,
    tx: Tx,
  ): Promise<void> {
    if (!backgroundId) return;
    const media = await this.media.findActive(churchId, backgroundId, tx);
    if (!media?.isBackground) {
      throw validationFailed({ backgroundId: 'Ese fondo no existe.' });
    }
  }

  /**
   * La pista tiene que ser un audio vivo de la iglesia y no ser ya de otra
   * cancion (uno a uno). `songId` es la cancion que la quiere, si ya existe.
   */
  private async assertAudioAvailable(
    churchId: string,
    audioId: string | null,
    songId: string | null,
    tx: Tx,
  ): Promise<void> {
    if (!audioId) return;
    const audio = await this.media.findActive(churchId, audioId, tx);
    if (!audio || audio.kind !== MediaKind.AUDIO) {
      throw validationFailed({ audioId: 'Esa pista no existe.' });
    }
    const owner = await this.repository.findByAudioId(audioId, tx);
    if (owner && owner.id !== songId) {
      throw validationFailed({ audioId: 'Esa pista ya es de otra canción.' });
    }
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
