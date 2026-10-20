import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

describe('videos de YouTube de la biblioteca (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  const video = {
    videoId: 'dQw4w9WgXcQ',
    title: 'Un video',
    author: 'Un canal',
  };

  it('guarda, lista y no duplica el mismo video', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const created = await api.post('/youtube-videos', video);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject(video);

    const again = await api.post('/youtube-videos', video);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(created.body.data.id);

    const list = (await api.get('/youtube-videos')).body.data;
    expect(list).toHaveLength(1);
    expect(
      (await api.get(`/youtube-videos/${created.body.data.id}`)).body.data
        .title,
    ).toBe('Un video');
  });

  it('rechaza un video que no es de YouTube', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const response = await api.post('/youtube-videos', {
      ...video,
      videoId: 'no es video',
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('un video entra al plan y al borrarlo sale de la biblioteca y del plan', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const { id } = (await api.post('/youtube-videos', video)).body.data;

    const added = await api.post('/service-plan', {
      kind: 'youtube',
      refId: id,
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ kind: 'youtube', refId: id });

    const missing = await api.post('/service-plan', {
      kind: 'youtube',
      refId: '0198f0e0-0000-7000-8000-000000000000',
    });
    expect(missing.status).toBe(400);

    expect((await api.delete(`/youtube-videos/${id}`)).status).toBe(204);
    expect((await api.get('/youtube-videos')).body.data).toHaveLength(0);
    expect((await api.get('/service-plan')).body.data).toHaveLength(0);
    expect((await api.get(`/youtube-videos/${id}`)).status).toBe(404);
  });

  it('cada iglesia ve solo los suyos', async () => {
    const first = authed(app, (await signUp(app)).accessToken);
    const second = authed(app, (await signUp(app)).accessToken);
    await first.post('/youtube-videos', video);
    expect((await second.get('/youtube-videos')).body.data).toHaveLength(0);
  });
});
