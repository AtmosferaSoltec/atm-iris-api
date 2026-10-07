import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import {
  authed,
  cleanUp,
  createTestApp,
  signUp,
} from './helpers.js';

describe('registros de tiempos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('PUT idempotente, ajuste y blockCount', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);

    const ana = (await api.post('/people', { name: 'Ana Torres' })).body.data;
    const type = (
      await api.post('/service-types', { name: 'Culto', color: '#FFB547', schedule: null, blocks: [] })
    ).body.data;

    const id = randomUUID();
    const blockIds = [randomUUID(), randomUUID()];
    const record = {
      date: '2026-10-04T15:00:00.000Z',
      serviceTypeId: type.id,
      serviceTypeName: 'Culto',
      blocks: [
        {
          id: blockIds[0],
          name: 'Bienvenida',
          plannedSeconds: 600,
          actualSeconds: 640,
          personId: ana.id,
          personName: 'Ana Torres',
          status: 'completed',
        },
        {
          id: blockIds[1],
          name: 'Anuncios',
          plannedSeconds: 300,
          actualSeconds: 0,
          personId: ana.id,
          personName: 'Ana Torres',
          status: 'skipped',
        },
      ],
    };

    const created = await api.put(`/service-records/${id}`, record);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ id, date: record.date, serviceTypeName: 'Culto' });

    const retried = await api.put(`/service-records/${id}`, record);
    expect(retried.status).toBe(200);
    expect((await api.get('/service-records')).body.meta.total).toBe(1);

    // Con otro contenido, el mismo id reemplaza el registro.
    const changed = { ...record, serviceTypeName: 'Culto dominical' };
    const replaced = await api.put(`/service-records/${id}`, changed);
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.serviceTypeName).toBe('Culto dominical');

    const adjusted = await api.patch(`/service-records/${id}/blocks/${blockIds[0]}`, {
      actualSeconds: 600,
    });
    expect(adjusted.body.data.blocks[0]).toMatchObject({ actualSeconds: 600, status: 'adjusted' });

    // El omitido no cuenta.
    const people = (await api.get('/people')).body.data;
    expect(people[0]).toMatchObject({ name: 'Ana Torres', blockCount: 1 });

    const foreign = authed(app, (await signUp(app)).accessToken);
    expect((await foreign.put(`/service-records/${id}`, record)).body.code).toBe('ID_CONFLICT');

    await api.delete(`/service-records/${id}`);
    expect((await api.get('/people')).body.data[0].blockCount).toBe(0);
  });
});
