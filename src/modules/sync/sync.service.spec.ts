import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChurchService } from '../church/church.service.js';
import type { MediaRepository } from '../media/media.repository.js';
import type { PeopleRepository } from '../people/people.repository.js';
import type { ServiceRecordsRepository } from '../service-records/service-records.repository.js';
import type { ServiceTypesRepository } from '../service-types/service-types.repository.js';
import type { SongsRepository } from '../songs/songs.repository.js';
import type { SyncRepository } from './sync.repository.js';
import { SyncService } from './sync.service.js';
import type { SyncCandidate } from './sync.types.js';

const now = new Date('2026-10-05T12:00:00.000Z');
const person = (id: string, deletedAt: Date | null = null) => ({
  id,
  churchId: 'church-1',
  name: `Persona ${id}`,
  nameKey: id,
  deletedAt,
  syncVersion: 1n,
  createdAt: now,
  updatedAt: now,
});
const candidate = (
  type: SyncCandidate['type'],
  id: string,
  version: number,
  isDeleted = false,
): SyncCandidate => ({ type, id, version: BigInt(version), isDeleted });

function setup() {
  const repository = {
    findCandidates: vi.fn().mockResolvedValue([]),
    churchVersion: vi.fn().mockResolvedValue(1n),
  };
  const church = { get: vi.fn().mockResolvedValue({ id: 'church-1', name: 'Iglesia' }) };
  const people = {
    findManyByIds: vi.fn(async (_c: string, ids: string[]) => ids.map((id) => person(id))),
    countBlocks: vi.fn().mockResolvedValue(new Map([['p2', 3]])),
  };
  const empty = { findManyByIds: vi.fn().mockResolvedValue([]) };
  const service = new SyncService(
    repository as unknown as SyncRepository,
    church as unknown as ChurchService,
    people as unknown as PeopleRepository,
    empty as unknown as ServiceTypesRepository,
    empty as unknown as SongsRepository,
    empty as unknown as MediaRepository,
    empty as unknown as ServiceRecordsRepository,
  );
  return { repository, church, people, service };
}

describe('SyncService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('pide uno de mas para saber si hay otra pagina, y corta en limit', async () => {
    ctx.repository.findCandidates.mockResolvedValue([
      candidate('people', 'p1', 5),
      candidate('people', 'p2', 6),
      candidate('people', 'p3', 7),
    ]);

    const page = await ctx.service.changes('church-1', { since: 0n, limit: 2 });

    expect(ctx.repository.findCandidates).toHaveBeenCalledWith('church-1', 0n, 3);
    expect(page.hasMore).toBe(true);
    expect(page.changes.people.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(page.changes.people[1]!.blockCount).toBe(3);
    // Con mas paginas, el cursor es lo ultimo entregado (no la version de la iglesia).
    expect(page.cursor).toBe('6');
  });

  it('los borrados van solo en deleted, sin cargarse', async () => {
    ctx.repository.findCandidates.mockResolvedValue([
      candidate('people', 'p1', 5, true),
      candidate('songs', 's1', 6, true),
      candidate('people', 'p2', 7),
    ]);

    const page = await ctx.service.changes('church-1', { since: 4n, limit: 200 });

    expect(page.deleted.people).toEqual(['p1']);
    expect(page.deleted.songs).toEqual(['s1']);
    expect(page.changes.people.map((p) => p.id)).toEqual(['p2']);
    expect(ctx.people.findManyByIds).toHaveBeenCalledWith('church-1', ['p2']);
    expect(page.hasMore).toBe(false);
  });

  it('incluye la iglesia si cambio despues del cursor, y el cursor llega hasta su version', async () => {
    ctx.repository.churchVersion.mockResolvedValue(20n);
    ctx.repository.findCandidates.mockResolvedValue([candidate('people', 'p1', 12)]);

    const page = await ctx.service.changes('church-1', { since: 10n, limit: 200 });

    expect(page.church).toMatchObject({ id: 'church-1' });
    expect(page.cursor).toBe('20');
  });

  it('sin cambios: church null, listas vacias y el mismo cursor', async () => {
    ctx.repository.churchVersion.mockResolvedValue(3n);

    const page = await ctx.service.changes('church-1', { since: 10n, limit: 200 });

    expect(page).toEqual({
      church: null,
      changes: { people: [], serviceTypes: [], songs: [], media: [], serviceRecords: [] },
      deleted: { people: [], serviceTypes: [], songs: [], media: [], serviceRecords: [] },
      cursor: '10',
      hasMore: false,
    });
    expect(ctx.church.get).not.toHaveBeenCalled();
  });

  it('una fila que se borro entre la consulta de candidatos y la carga no aparece en changes', async () => {
    ctx.repository.findCandidates.mockResolvedValue([candidate('people', 'p1', 5)]);
    ctx.people.findManyByIds.mockResolvedValue([person('p1', now)]);

    const page = await ctx.service.changes('church-1', { since: 0n, limit: 200 });
    expect(page.changes.people).toEqual([]);
  });
});
