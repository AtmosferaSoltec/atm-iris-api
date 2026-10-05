import { Injectable } from '@nestjs/common';

import { ChurchService } from '../church/church.service.js';
import { toMediaAsset } from '../media/media.mapper.js';
import { MediaRepository } from '../media/media.repository.js';
import { toPerson } from '../people/people.mapper.js';
import { PeopleRepository } from '../people/people.repository.js';
import { toServiceRecord } from '../service-records/service-records.mapper.js';
import { ServiceRecordsRepository } from '../service-records/service-records.repository.js';
import { toServiceType } from '../service-types/service-types.mapper.js';
import { ServiceTypesRepository } from '../service-types/service-types.repository.js';
import { toSong } from '../songs/songs.mapper.js';
import { SongsRepository } from '../songs/songs.repository.js';
import type { SyncChangesQuery } from './dto/sync.schema.js';
import { SyncRepository } from './sync.repository.js';
import type { SyncCandidate, SyncEntityType, SyncPage } from './sync.types.js';

const ENTITY_TYPES: SyncEntityType[] = [
  'people',
  'serviceTypes',
  'songs',
  'media',
  'serviceRecords',
];

/**
 * Feed incremental de las consolas (contrato §12).
 *
 * El cursor es la `sync_version` mas alta entregada. Como toda escritura de la
 * iglesia pasa por `ChurchWriteLock`, las versiones se confirman en orden y
 * "todo lo mayor al cursor" nunca se salta una fila confirmada tarde.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly church: ChurchService,
    private readonly people: PeopleRepository,
    private readonly serviceTypes: ServiceTypesRepository,
    private readonly songs: SongsRepository,
    private readonly media: MediaRepository,
    private readonly serviceRecords: ServiceRecordsRepository,
  ) {}

  async changes(churchId: string, query: SyncChangesQuery): Promise<SyncPage> {
    const { since, limit } = query;

    // Uno de mas para saber si hay otra pagina sin contar.
    const found = await this.repository.findCandidates(churchId, since, limit + 1);
    const hasMore = found.length > limit;
    const candidates = found.slice(0, limit);

    const churchVersion = await this.repository.churchVersion(churchId);
    const page = emptyPage();

    if (churchVersion > since) page.church = await this.church.get(churchId);

    // Un recurso que cambio y luego se borro llega solo como borrado: su fila
    // actual ya tiene `deleted_at`.
    for (const candidate of candidates) {
      if (candidate.isDeleted) page.deleted[candidate.type].push(candidate.id);
    }
    await this.loadChanges(churchId, candidates, page);

    // Sin mas paginas, el cursor puede avanzar hasta la version de la iglesia
    // (que no cuenta para `limit`); con mas paginas, solo hasta lo entregado.
    const last = candidates.at(-1)?.version ?? since;
    const cursor = !hasMore && churchVersion > last ? churchVersion : last;

    return { ...page, cursor: cursor.toString(), hasMore };
  }

  /** Carga completos los no borrados, por tipo, en el orden de version. */
  private async loadChanges(
    churchId: string,
    candidates: SyncCandidate[],
    page: SyncPage,
  ): Promise<void> {
    const idsOf = (type: SyncEntityType) =>
      candidates.filter((c) => c.type === type && !c.isDeleted).map((c) => c.id);

    const ids = Object.fromEntries(ENTITY_TYPES.map((type) => [type, idsOf(type)])) as Record<
      SyncEntityType,
      string[]
    >;

    const [people, counts, serviceTypes, songs, media, records] = await Promise.all([
      ids.people.length ? this.people.findManyByIds(churchId, ids.people) : [],
      this.people.countBlocks(churchId, ids.people),
      ids.serviceTypes.length ? this.serviceTypes.findManyByIds(churchId, ids.serviceTypes) : [],
      ids.songs.length ? this.songs.findManyByIds(churchId, ids.songs) : [],
      ids.media.length ? this.media.findManyByIds(churchId, ids.media) : [],
      ids.serviceRecords.length
        ? this.serviceRecords.findManyByIds(churchId, ids.serviceRecords)
        : [],
    ]);

    page.changes.people = inOrder(ids.people, people).map((row) =>
      toPerson(row, counts.get(row.id) ?? 0),
    );
    page.changes.serviceTypes = inOrder(ids.serviceTypes, serviceTypes).map(toServiceType);
    page.changes.songs = inOrder(ids.songs, songs).map(toSong);
    page.changes.media = inOrder(ids.media, media).map(toMediaAsset);
    page.changes.serviceRecords = inOrder(ids.serviceRecords, records).map(toServiceRecord);
  }
}

/** Respeta el orden de los ids (el de version) y descarta lo que ya no este. */
function inOrder<T extends { id: string; deletedAt: Date | null }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row && !row.deletedAt ? [row] : [];
  });
}

function emptyPage(): SyncPage {
  return {
    church: null,
    changes: { people: [], serviceTypes: [], songs: [], media: [], serviceRecords: [] },
    deleted: { people: [], serviceTypes: [], songs: [], media: [], serviceRecords: [] },
    cursor: '0',
    hasMore: false,
  };
}
