import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

type Page = {
  church: { modules: { bible: boolean; multimedia: boolean } } | null;
  changes: Record<string, { id: string; name?: string }[]>;
  deleted: Record<string, string[]>;
  cursor: string;
  hasMore: boolean;
};

describe('sincronización (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('copia completa desde 0, cambios, borrados y módulos', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const page = async (since: string, limit = 200): Promise<Page> =>
      (await api.get(`/sync/changes?since=${since}&limit=${limit}`)).body.data;

    for (const name of ['Ana', 'Beto', 'Carla', 'Dario']) await api.post('/people', { name });
    await api.post('/songs', { title: 'Sublime gracia', sections: [{ text: 'Sublime gracia' }] });

    // Copia completa en paginas de 2.
    let cursor = '0';
    let pages = 0;
    let church: Page['church'] = null;
    const people: string[] = [];
    let last: Page;
    do {
      last = await page(cursor, 2);
      pages += 1;
      church ??= last.church;
      people.push(...last.changes.people!.map((p) => p.name!));
      cursor = last.cursor;
    } while (last.hasMore);

    expect(pages).toBe(3);
    expect(people).toEqual(['Ana', 'Beto', 'Carla', 'Dario']);
    expect(church).not.toBeNull();

    const quiet = await page(cursor);
    expect(quiet).toMatchObject({ church: null, cursor, hasMore: false });

    // Crear y borrar despues del cursor: solo en `deleted`.
    const ghost = (await api.post('/people', { name: 'Fugaz' })).body.data;
    await api.delete(`/people/${ghost.id}`);
    const afterDelete = await page(cursor);
    expect(afterDelete.deleted.people).toEqual([ghost.id]);
    expect(afterDelete.changes.people).toEqual([]);
    cursor = afterDelete.cursor;

    // Renombrar: llega con el nombre nuevo y el cursor avanza.
    const ana = (await api.get('/people')).body.data.find((p: { name: string }) => p.name === 'Ana');
    await api.patch(`/people/${ana.id}`, { name: 'Ana María' });
    const renamed = await page(cursor);
    expect(renamed.changes.people!.map((p) => p.name)).toEqual(['Ana María']);
    expect(BigInt(renamed.cursor) > BigInt(cursor)).toBe(true);
    cursor = renamed.cursor;

    // Cambiar modulos trae la iglesia.
    await api.put('/church/modules', { bible: true, multimedia: false, timeControl: true });
    const modules = await page(cursor);
    expect(modules.church?.modules.multimedia).toBe(false);
    expect(modules.church?.modules.bible).toBe(false);
    cursor = modules.cursor;

    // Encender la Biblia para todo Iris, a mano en la base, llega a las consolas sin otro cambio.
    await prisma.systemFeature.update({ where: { key: 'bible' }, data: { enabled: true } });
    try {
      const switched = await page(cursor);
      expect(switched.church?.modules.bible).toBe(true);
    } finally {
      await prisma.systemFeature.update({ where: { key: 'bible' }, data: { enabled: false } });
    }

    expect((await api.get('/sync/changes?since=-1')).body.code).toBe('VALIDATION_FAILED');
  });
});
