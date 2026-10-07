import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

describe('iglesia, personas y tipos de servicio (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('GET /church con la forma del contrato y cambios de ajustes y módulos', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const church = await api.get('/church');
    expect(church.body.data).toMatchObject({
      timezone: 'America/Lima',
      modules: { bible: true, multimedia: true, timeControl: true },
      storage: { usedBytes: 0, quotaBytes: 5368709120 },
    });

    expect((await api.patch('/church', { timezone: 'Marte/Base' })).status).toBe(400);
    const patched = await api.patch('/church', { name: 'Nueva', timezone: 'America/Bogota' });
    expect(patched.body.data).toMatchObject({ name: 'Nueva', timezone: 'America/Bogota' });

    const modules = await api.put('/church/modules', {
      bible: false,
      multimedia: true,
      timeControl: false,
    });
    expect(modules.body.data.modules).toEqual({ bible: false, multimedia: true, timeControl: false });
  });

  it('personas: duplicado por nameKey, reuso tras borrar e idempotencia por id', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const first = await api.post('/people', { name: 'José Pérez' });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ name: 'José Pérez', blockCount: 0 });

    const duplicate = await api.post('/people', { name: ' jose  perez ' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('PERSON_NAME_TAKEN');

    await api.delete(`/people/${first.body.data.id}`);
    expect((await api.post('/people', { name: ' jose  perez ' })).status).toBe(201);

    const id = randomUUID();
    expect((await api.post('/people', { id, name: 'Ana' })).status).toBe(201);
    const retry = await api.post('/people', { id, name: 'Ana' });
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(id);

    const foreign = authed(app, (await signUp(app)).accessToken);
    expect((await foreign.post('/people', { id, name: 'Otra' })).body.code).toBe('ID_CONFLICT');
    expect((await foreign.patch(`/people/${id}`, { name: 'X' })).status).toBe(404);
  });

  it('tipos de servicio: bloques, reemplazo y responsable borrado', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const created = await api.post('/service-types', {
      name: 'Culto general',
      color: '#FFB547',
      schedule: { weekday: 1, hour: 10, minute: 0 },
      blocks: [
        { name: 'Bienvenida', plannedMinutes: 10 },
        { name: 'Prédica', plannedMinutes: 40 },
      ],
    });
    expect(created.status).toBe(201);
    const [welcome, sermon] = created.body.data.blocks;

    const duplicate = await api.post('/service-types', {
      name: 'culto GENERAL',
      color: '#FFB547',
      schedule: null,
      blocks: [],
    });
    expect(duplicate.body.code).toBe('SERVICE_TYPE_NAME_TAKEN');

    const replaced = await api.put(`/service-types/${created.body.data.id}`, {
      name: 'Culto general',
      color: '#4E5BFF',
      schedule: null,
      blocks: [
        { id: sermon.id, name: 'Prédica', plannedMinutes: 45 },
        { id: welcome.id, name: 'Bienvenida', plannedMinutes: 10 },
        { name: 'Anuncios', plannedMinutes: 5 },
      ],
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.blocks.map((b: { id: string }) => b.id).slice(0, 2)).toEqual([
      sermon.id,
      welcome.id,
    ]);
    expect(replaced.body.data.schedule).toBeNull();

    expect(replaced.body.data.blocks[0]).not.toHaveProperty('defaultPersonId');

    const id = randomUUID();
    const upsert = await api.put(`/service-types/${id}`, {
      name: 'Jóvenes',
      color: '#F0508C',
      schedule: { weekday: 7, hour: 19, minute: 0 },
      blocks: [],
    });
    expect(upsert.status).toBe(201);

    await api.delete(`/service-types/${id}`);
    expect((await api.get('/service-types')).body.data).toHaveLength(1);
  });
});
