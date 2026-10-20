import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

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
      await api.post('/service-types', {
        name: 'Culto',
        schedule: null,
        blocks: [],
      })
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
    expect(created.body.data).toMatchObject({
      id,
      date: record.date,
      serviceTypeName: 'Culto',
    });

    const retried = await api.put(`/service-records/${id}`, record);
    expect(retried.status).toBe(200);
    expect((await api.get('/service-records')).body.meta.total).toBe(1);

    // Con otro contenido, el mismo id reemplaza el registro.
    const changed = { ...record, serviceTypeName: 'Culto dominical' };
    const replaced = await api.put(`/service-records/${id}`, changed);
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.serviceTypeName).toBe('Culto dominical');

    const adjusted = await api.patch(
      `/service-records/${id}/blocks/${blockIds[0]}`,
      {
        actualSeconds: 600,
      },
    );
    expect(adjusted.body.data.blocks[0]).toMatchObject({
      actualSeconds: 600,
      status: 'adjusted',
    });

    // El omitido no cuenta.
    const people = (await api.get('/people')).body.data;
    expect(people[0]).toMatchObject({ name: 'Ana Torres', blockCount: 1 });

    const foreign = authed(app, (await signUp(app)).accessToken);
    expect(
      (await foreign.put(`/service-records/${id}`, record)).body.code,
    ).toBe('ID_CONFLICT');

    await api.delete(`/service-records/${id}`);
    expect((await api.get('/people')).body.data[0].blockCount).toBe(0);
  });

  it('en curso: se guarda al empezar, se retoma y no se reabre al terminar', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);

    const ana = (await api.post('/people', { name: 'Ana Torres' })).body.data;
    const type = (
      await api.post('/service-types', {
        name: 'Culto',
        schedule: null,
        blocks: [],
      })
    ).body.data;

    const id = randomUUID();
    const [welcome, worship] = [randomUUID(), randomUUID()];
    const startedAt = '2026-10-04T15:00:00.000Z';
    const block = (blockId: string, name: string, extra: object) => ({
      id: blockId,
      name,
      plannedSeconds: 600,
      actualSeconds: 0,
      personId: ana.id,
      personName: 'Ana Torres',
      ...extra,
    });

    // "Comenzar": el primer bloque corre, el resto espera.
    const started = await api.put(`/service-records/${id}`, {
      status: 'inProgress',
      date: startedAt,
      serviceTypeId: type.id,
      serviceTypeName: 'Culto',
      blocks: [
        block(welcome, 'Bienvenida', {
          status: 'running',
          startedAt,
          endedAt: null,
        }),
        block(worship, 'Alabanzas', {
          status: 'pending',
          startedAt: null,
          endedAt: null,
        }),
      ],
    });
    expect(started.status).toBe(201);

    // Otra consola lo encuentra para retomarlo, con la hora de inicio del bloque.
    const open = await api.get(
      `/service-records?status=inProgress&serviceTypeId=${type.id}`,
    );
    expect(open.body.data).toHaveLength(1);
    expect(open.body.data[0]).toMatchObject({ id, status: 'inProgress' });
    expect(open.body.data[0].blocks[0]).toMatchObject({
      status: 'running',
      startedAt,
    });

    // El pendiente aun no cuenta para la persona, y no se ajusta nada hasta terminar.
    expect((await api.get('/people')).body.data[0].blockCount).toBe(1);
    const early = await api.patch(`/service-records/${id}/blocks/${welcome}`, {
      actualSeconds: 10,
    });
    expect(early.body.code).toBe('VALIDATION_FAILED');

    const finished = {
      status: 'finished',
      date: startedAt,
      serviceTypeId: type.id,
      serviceTypeName: 'Culto',
      blocks: [
        block(welcome, 'Bienvenida', {
          status: 'completed',
          actualSeconds: 600,
          startedAt,
          endedAt: '2026-10-04T15:10:00.000Z',
        }),
        block(worship, 'Alabanzas', {
          status: 'completed',
          actualSeconds: 600,
          startedAt: '2026-10-04T15:10:00.000Z',
          endedAt: '2026-10-04T15:20:00.000Z',
        }),
      ],
    };
    expect((await api.put(`/service-records/${id}`, finished)).status).toBe(
      200,
    );
    expect(
      (await api.get('/service-records?status=inProgress')).body.data,
    ).toHaveLength(0);
    expect((await api.get('/people')).body.data[0].blockCount).toBe(2);

    // Un envio atrasado de otra consola no lo vuelve a poner en curso.
    const stale = await api.put(`/service-records/${id}`, {
      ...started.body.data,
      status: 'inProgress',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('RECORD_FINISHED');
  });
});
