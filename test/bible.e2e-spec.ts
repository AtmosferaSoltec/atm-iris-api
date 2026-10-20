import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

// La Biblia salio de las consolas por ahora (ver AppModule): sus rutas no existen.
describe('Biblia fuera de servicio (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('sus rutas responden 404', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    expect((await api.get('/bible/translations')).status).toBe(404);
    expect((await api.get('/bible/translations/rvr1909/download')).status).toBe(
      404,
    );
  });
});
