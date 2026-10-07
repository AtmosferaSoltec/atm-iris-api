import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

const song = (title: string) => ({
  title,
  author: '',
  sections: [{ label: null, text: 'Letra de prueba' }],
});

describe('plan de servicio (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('agregar, reordenar, quitar y vaciar, en orden', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const songA = await api.post('/songs', song('Canción A'));
    const songB = await api.post('/songs', song('Canción B'));

    const added1 = await api.post('/service-plan', {
      kind: 'song',
      refId: songA.body.data.id,
    });
    expect(added1.status).toBe(201);
    expect(added1.body.data).toMatchObject({
      kind: 'song',
      refId: songA.body.data.id,
      position: 0,
    });

    const added2 = await api.post('/service-plan', {
      kind: 'song',
      refId: songB.body.data.id,
    });
    expect(added2.body.data.position).toBe(1);

    const list = await api.get('/service-plan');
    expect(list.body.data.map((item: { refId: string }) => item.refId)).toEqual([
      songA.body.data.id,
      songB.body.data.id,
    ]);

    // Reordenar: B pasa al frente.
    const moved = await api.put(`/service-plan/${added2.body.data.id}/position`, {
      position: 0,
    });
    expect(moved.status).toBe(204);

    const reordered = await api.get('/service-plan');
    expect(reordered.body.data.map((item: { refId: string }) => item.refId)).toEqual([
      songB.body.data.id,
      songA.body.data.id,
    ]);

    // Quitar uno.
    expect((await api.delete(`/service-plan/${added1.body.data.id}`)).status).toBe(204);
    expect((await api.get('/service-plan')).body.data).toHaveLength(1);

    // Vaciar todo.
    expect((await api.delete('/service-plan')).status).toBe(204);
    expect((await api.get('/service-plan')).body.data).toEqual([]);
  });

  it('rechaza una referencia que no existe', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const invalid = await api.post('/service-plan', {
      kind: 'song',
      refId: '00000000-0000-0000-0000-000000000000',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
  });

  it('borrar la cancion limpia tambien el plan (sin referencia colgando)', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const created = await api.post('/songs', song('Canción C'));

    const added = await api.post('/service-plan', {
      kind: 'song',
      refId: created.body.data.id,
    });
    expect(added.status).toBe(201);

    await api.delete(`/songs/${created.body.data.id}`);

    expect((await api.get('/service-plan')).body.data).toEqual([]);
  });
});
