import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

const SONGS = [
  {
    title: 'Sublime gracia',
    author: 'John Newton',
    copyright: null,
    sections: [
      { label: 'Estrofa 1', text: 'Sublime gracia del Señor\nque a un pecador salvó' },
      { label: null, text: 'fui ciego mas hoy veo yo' },
    ],
  },
  {
    title: 'Castillo fuerte',
    author: 'Martín Lutero',
    copyright: null,
    sections: [{ label: null, text: 'Castillo fuerte es nuestro Dios' }],
  },
];

describe('canciones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('crear, leer, buscar sin acentos e importar con duplicados', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const created = await api.post('/songs', SONGS[0]);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'Sublime gracia', copyright: null });
    expect(created.body.data.sections).toHaveLength(2);

    const sublime = await api.get('/songs?search=SUBLIME');
    expect(sublime.body.data[0]).toMatchObject({
      title: 'Sublime gracia',
      sectionCount: 2,
      firstLine: 'Sublime gracia del Señor',
    });

    const senor = await api.get('/songs?search=senor');
    expect(senor.body.meta.total).toBe(1);

    const imported = await api.post('/songs/import', { songs: [...SONGS, SONGS[1]] });
    expect(imported.status).toBe(201);
    expect(imported.body.data.created.map((s: { title: string }) => s.title)).toEqual([
      'Castillo fuerte',
    ]);
    expect(imported.body.data.skipped).toEqual([
      { title: 'Sublime gracia', reason: 'duplicate' },
      { title: 'Castillo fuerte', reason: 'duplicate' },
    ]);

    const again = await api.post('/songs/import', { songs: SONGS });
    expect(again.body.data.created).toEqual([]);

    const typo = await api.get('/songs?search=castilo');
    expect(typo.body.data[0].title).toBe('Castillo fuerte');

    const list = await api.get('/songs?limit=1');
    expect(list.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(list.body.data[0].title).toBe('Castillo fuerte');

    await api.delete(`/songs/${created.body.data.id}`);
    expect((await api.get(`/songs/${created.body.data.id}`)).status).toBe(404);
  });
});
