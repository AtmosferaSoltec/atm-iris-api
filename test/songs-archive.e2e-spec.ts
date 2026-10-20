import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { SongsArchiveService } from '../src/modules/songs/songs-archive.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

const song = (title: string) => ({
  title,
  author: '',
  sections: [{ label: null, text: 'Letra de prueba' }],
});

describe('archivado de canciones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('archivar y desarchivar a mano mueve la canción entre listas', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const created = await api.post('/songs', song('Sublime gracia'));
    const id = created.body.data.id;

    const archived = await api.post(`/songs/${id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).not.toBeNull();
    expect(archived.body.data.sections).toHaveLength(1);

    expect((await api.get('/songs')).body.data).toHaveLength(0);
    const list = await api.get('/songs?archived=true');
    expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([id]);

    const back = await api.post(`/songs/${id}/unarchive`);
    expect(back.body.data.archivedAt).toBeNull();
    expect((await api.get('/songs')).body.data).toHaveLength(1);
  });

  it('el cron archiva lo que lleva un año sin usarse, y usarla la saca del archivo', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const old = (await api.post('/songs', song('Vieja'))).body.data.id;
    const planned = (await api.post('/songs', song('En el plan'))).body.data.id;
    await api.post('/service-plan', { kind: 'song', refId: planned });

    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await prisma.song.updateMany({
      where: { id: { in: [old, planned] } },
      data: { createdAt: longAgo, lastUsedAt: longAgo },
    });

    await app.get(SongsArchiveService).run();

    const archived = await api.get('/songs?archived=true');
    expect(archived.body.data.map((s: { id: string }) => s.id)).toEqual([old]);

    // Agregarla al plan la devuelve a la biblioteca.
    await api.post('/service-plan', { kind: 'song', refId: old });
    expect((await api.get('/songs?archived=true')).body.data).toHaveLength(0);
    const used = await api.get(`/songs/${old}`);
    expect(used.body.data.archivedAt).toBeNull();
    expect(used.body.data.lastUsedAt).not.toBeNull();
  });
});
