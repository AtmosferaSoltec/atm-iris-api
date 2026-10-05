import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser, ChurchRole } from '../auth/auth.types.js';
import type { ServiceRecordInput } from './dto/service-records.schema.js';
import type { ServiceRecordsRepository } from './service-records.repository.js';
import { ServiceRecordsService } from './service-records.service.js';

const user = (role: ChurchRole): AuthenticatedUser => ({
  userId: 'u-1',
  churchId: 'church-1',
  sessionId: 's-1',
  role,
});

const input: ServiceRecordInput = {
  date: new Date('2026-10-04T15:00:00.000Z'),
  serviceTypeId: 'st-1',
  serviceTypeName: 'Culto general',
  blocks: [
    {
      id: 'b-1',
      name: 'Bienvenida',
      plannedSeconds: 600,
      actualSeconds: 580,
      personId: 'p-1',
      personName: 'Ana Torres',
      status: 'completed',
    },
  ],
};

/** Una fila guardada a partir del input. */
const row = (churchId = 'church-1', overrides: Partial<{ status: 'COMPLETED' | 'ADJUSTED'; actualSeconds: number; deletedAt: Date | null }> = {}) => ({
  id: 'r-1',
  churchId,
  date: input.date,
  serviceTypeId: 'st-1',
  serviceTypeName: 'Culto general',
  createdBySessionId: 's-1',
  deletedAt: overrides.deletedAt ?? null,
  syncVersion: 1n,
  createdAt: new Date(),
  updatedAt: new Date(),
  blocks: [
    {
      id: 'b-1',
      serviceRecordId: 'r-1',
      position: 0,
      name: 'Bienvenida',
      plannedSeconds: 600,
      actualSeconds: overrides.actualSeconds ?? 580,
      personId: 'p-1',
      personName: 'Ana Torres',
      status: overrides.status ?? ('COMPLETED' as const),
    },
  ],
});

function setup() {
  const repository = {
    withLock: vi.fn((_c: string, work: (tx: unknown) => unknown) => work('tx')),
    findAnyById: vi.fn(),
    serviceTypeBelongs: vi.fn().mockResolvedValue(true),
    findBlockOwners: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(row()),
    replace: vi.fn().mockResolvedValue(row()),
  };
  return {
    repository,
    service: new ServiceRecordsService(repository as unknown as ServiceRecordsRepository),
  };
}

describe('ServiceRecordsService · PUT idempotente', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('no existe → lo crea (201)', async () => {
    ctx.repository.findAnyById.mockResolvedValue(null);
    const result = await ctx.service.save(user('operator'), 'r-1', input);
    expect(result.isNew).toBe(true);
    expect(ctx.repository.create).toHaveBeenCalledWith('church-1', 'r-1', input, 's-1', 'tx');
  });

  it('existe igual → reintento: 200 sin escribir, aunque sea un operator', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row());
    const result = await ctx.service.save(user('operator'), 'r-1', input);
    expect(result.isNew).toBe(false);
    expect(ctx.repository.create).not.toHaveBeenCalled();
    expect(ctx.repository.replace).not.toHaveBeenCalled();
  });

  it('existe distinto → un operator recibe 403', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row('church-1', { actualSeconds: 999 }));
    await expect(ctx.service.save(user('operator'), 'r-1', input)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('existe distinto → con records.manage lo reemplaza (200)', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row('church-1', { actualSeconds: 999 }));
    const result = await ctx.service.save(user('admin'), 'r-1', input);
    expect(result.isNew).toBe(false);
    expect(ctx.repository.replace).toHaveBeenCalled();
  });

  it('un bloque ya ajustado no cuenta como igual al completed reenviado', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row('church-1', { status: 'ADJUSTED' }));
    await expect(ctx.service.save(user('operator'), 'r-1', input)).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
  });

  it('existe en otra iglesia → 409 ID_CONFLICT', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row('church-2'));
    await expect(ctx.service.save(user('owner'), 'r-1', input)).rejects.toMatchObject({
      response: { code: 'ID_CONFLICT' },
    });
  });

  it('borrado → 404', async () => {
    ctx.repository.findAnyById.mockResolvedValue(row('church-1', { deletedAt: new Date() }));
    await expect(ctx.service.save(user('owner'), 'r-1', input)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('un id de bloque de otro registro → 409 ID_CONFLICT en blocks.0.id', async () => {
    ctx.repository.findAnyById.mockResolvedValue(null);
    ctx.repository.findBlockOwners.mockResolvedValue([{ id: 'b-1', serviceRecordId: 'otro' }]);
    await expect(ctx.service.save(user('owner'), 'r-1', input)).rejects.toMatchObject({
      response: { code: 'ID_CONFLICT', errors: { 'blocks.0.id': expect.any(String) } },
    });
  });
});
