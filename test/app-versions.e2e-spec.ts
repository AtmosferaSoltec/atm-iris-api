import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp } from './helpers.js';

describe('app-version (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let original: { version: string; downloadUrl: string | null } | null;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    original = await prisma.appVersion.findUnique({
      where: { platform: 'windows' },
    });
    await prisma.appVersion.upsert({
      where: { platform: 'windows' },
      create: { platform: 'windows', version: '1.2.0' },
      update: { version: '1.2.0', downloadUrl: null },
    });
  });

  afterAll(async () => {
    if (original) {
      await prisma.appVersion.update({
        where: { platform: 'windows' },
        data: { version: original.version, downloadUrl: original.downloadUrl },
      });
    }
    await app.close();
  });

  const check = (platform: string, version: string) =>
    request(app.getHttpServer())
      .get('/api/v1/app-version')
      .query({ platform, version });

  it('es publico y exige actualizar a una version anterior', async () => {
    const response = await check('windows', '1.0.9');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      platform: 'windows',
      latestVersion: '1.2.0',
      updateRequired: true,
    });
  });

  it('no exige nada a la version publicada ni a una mayor', async () => {
    expect((await check('windows', '1.2.0')).body.data.updateRequired).toBe(
      false,
    );
    expect((await check('windows', '1.10.0')).body.data.updateRequired).toBe(
      false,
    );
  });

  it('rechaza una plataforma o una version mal escritas', async () => {
    expect((await check('linux', '1.0.0')).status).toBe(400);
    expect((await check('windows', 'abc')).status).toBe(400);
  });
});
