import { describe, expect, it, vi } from 'vitest';

import type { ChurchWriteLock, Tx } from '../../database/church-write-lock.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { ServiceTypesRepository } from './service-types.repository.js';

/** Una transaccion de mentira que registra lo que se le pide a `blockTemplate`. */
function fakeTx(existingIds: string[]) {
  const blockTemplate = {
    deleteMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue(existingIds.map((id) => ({ id }))),
    update: vi.fn(),
    create: vi.fn(),
  };
  const serviceType = {
    update: vi.fn(),
    findFirst: vi.fn().mockResolvedValue({ id: 'st-1' }),
  };
  return { tx: { blockTemplate, serviceType } as unknown as Tx, blockTemplate, serviceType };
}

const repository = new ServiceTypesRepository(
  {} as PrismaService,
  {} as ChurchWriteLock,
);

const input = (blocks: { id?: string; name: string }[]) => ({
  name: 'Culto general',
  color: '#FFB547' as const,
  schedule: null,
  blocks: blocks.map((block) => ({ ...block, plannedMinutes: 10 })),
});

describe('ServiceTypesRepository · reemplazo de bloques', () => {
  it('conserva los ids que vienen, crea los nuevos, borra los que faltan y reescribe posiciones', async () => {
    const { tx, blockTemplate, serviceType } = fakeTx(['b1', 'b2']);

    await repository.replace(
      'church-1',
      'st-1',
      input([{ id: 'b2', name: 'Alabanzas' }, { name: 'Nuevo' }, { id: 'b1', name: 'Bienvenida' }]),
      'culto general',
      tx,
    );

    // Se toca el padre: es el que sube de version.
    expect(serviceType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'st-1', churchId: 'church-1' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      }),
    );
    expect(blockTemplate.deleteMany).toHaveBeenCalledWith({
      where: { serviceTypeId: 'st-1', id: { notIn: ['b2', 'b1'] } },
    });
    expect(blockTemplate.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b2' },
      data: expect.objectContaining({ position: 0, name: 'Alabanzas' }),
    });
    expect(blockTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: undefined, serviceTypeId: 'st-1', position: 1, name: 'Nuevo' }),
    });
    expect(blockTemplate.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b1' },
      data: expect.objectContaining({ position: 2, name: 'Bienvenida' }),
    });
  });

  it('un id que todavia no existe se crea con ese id (la consola lo genero)', async () => {
    const { tx, blockTemplate } = fakeTx([]);
    await repository.replace('church-1', 'st-1', input([{ id: 'nuevo', name: 'X' }]), 'k', tx);
    expect(blockTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'nuevo', position: 0 }),
    });
  });

  it('sin bloques, borra todos', async () => {
    const { tx, blockTemplate } = fakeTx(['b1']);
    await repository.replace('church-1', 'st-1', input([]), 'k', tx);
    expect(blockTemplate.deleteMany).toHaveBeenCalledWith({
      where: { serviceTypeId: 'st-1', id: { notIn: [] } },
    });
    expect(blockTemplate.create).not.toHaveBeenCalled();
  });
});
