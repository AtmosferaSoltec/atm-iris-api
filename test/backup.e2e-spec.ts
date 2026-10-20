import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

const song = (title: string, youtubeId: string | null = null) => ({
  title,
  author: 'Autor',
  sections: [{ label: 'Coro', text: `Letra de ${title}` }],
  youtubeId,
});

describe('respaldo y borrado masivo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('exporta de una cuenta e importa en otra, sin duplicar al repetir', async () => {
    const from = authed(app, (await signUp(app)).accessToken);
    await from.post('/songs', song('Sublime gracia', 'fOBdcuX1FyQ'));
    await from.post('/songs', song('Cuán grande es Él'));
    await from.post('/youtube-videos', {
      videoId: 'fOBdcuX1FyQ',
      title: 'Un video',
      author: 'Alguien',
    });

    const backup = (await from.get('/backup/export')).body.data;
    expect(backup).toMatchObject({ format: 'iris-backup', version: 1 });
    expect(backup.songs).toHaveLength(2);
    expect(backup.youtubeVideos).toHaveLength(1);

    const to = authed(app, (await signUp(app)).accessToken);
    const first = await to.post('/backup/import', backup);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ songs: 2, youtubeVideos: 1 });
    expect((await to.get('/songs')).body.data).toHaveLength(2);

    const again = await to.post('/backup/import', backup);
    expect(again.body.data).toMatchObject({ songs: 0, youtubeVideos: 0 });
    expect(again.body.data.skipped).toBe(3);

    const wrong = await to.post('/backup/import', { format: 'otra-cosa' });
    expect(wrong.status).toBe(400);
  });

  it('eliminar en masa pide confirmación y borra lo elegido', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const created = await api.post('/songs', song('Una'));
    await api.post('/songs', song('Otra'));
    await api.post('/service-plan', {
      kind: 'song',
      refId: created.body.data.id,
    });

    const unconfirmed = await api.post('/backup/erase', { songs: true });
    expect(unconfirmed.status).toBe(400);
    expect((await api.get('/songs')).body.data).toHaveLength(2);

    const erased = await api.post('/backup/erase', {
      songs: true,
      confirm: 'ELIMINAR',
    });
    expect(erased.body.data.songs).toBe(2);
    expect((await api.get('/songs')).body.data).toHaveLength(0);
    expect((await api.get('/service-plan')).body.data).toHaveLength(0);
  });

  it('una canción rechaza un fondo que no existe', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const bad = await api.post('/songs', {
      ...song('Con fondo'),
      backgroundId: '0199b3a0-0000-7000-8000-000000000000',
    });
    expect(bad.status).toBe(400);
    const ok = await api.post('/songs', song('Sin fondo'));
    expect(ok.body.data.backgroundId).toBeNull();
  });
});
