import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { cleanUp, createTestApp } from './helpers.js';
import type { PrismaService } from '../src/database/prisma.service.js';

// Corre en su propio proceso (pool forks) y vuelve al limite real. Tiene que
// ser `vi.hoisted`: `@Throttle` lee la variable al importar el controlador, y
// los imports se evaluan antes que cualquier otra linea del archivo.
vi.hoisted(() => {
  process.env.LOGIN_THROTTLE_LIMIT = '5';
});

describe('limite de intentos de login (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('el sexto intento en un minuto responde 429', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/sign-in')
        .send({
          email: 'nadie@e2e.iris.test',
          password: 'x',
          client: { platform: 'web' },
        });

    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
