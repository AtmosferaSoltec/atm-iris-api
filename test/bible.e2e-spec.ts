import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

// La RVR 1909 se importa con `pnpm db:import-bible` (docs/bible-source.md):
// sin ella en la base, estas pruebas no tienen que leer.
describe('Biblia RVR 1909 (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let imported = false;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    imported =
      (await prisma.bibleTranslation.findUnique({
        where: { code: 'rvr1909' },
      })) !== null;
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('lista la traducción, sus 66 libros y un capítulo', async ({ skip }) => {
    if (!imported) skip();
    const api = authed(app, (await signUp(app)).accessToken);

    const translations = (await api.get('/bible/translations')).body.data;
    expect(translations).toEqual([
      expect.objectContaining({ code: 'rvr1909', name: 'Reina-Valera 1909' }),
    ]);

    const books = (await api.get('/bible/translations/rvr1909/books')).body
      .data;
    expect(books).toHaveLength(66);
    expect(books[42]).toMatchObject({
      id: 'JHN',
      name: 'Juan',
      chapterCount: 21,
    });

    const john3 = (
      await api.get('/bible/translations/rvr1909/books/JHN/chapters/3')
    ).body.data;
    expect(john3.verses[15]).toMatchObject({ number: 16 });
    expect(john3.verses[15].text).toMatch(/de tal manera amó Dios al mundo/i);

    expect(
      (await api.get('/bible/translations/rvr1909/books/JHN/chapters/22'))
        .status,
    ).toBe(404);
  });

  it('el plan guarda pasajes que existen, y rechaza los que no', async ({
    skip,
  }) => {
    if (!imported) skip();
    const api = authed(app, (await signUp(app)).accessToken);

    const added = await api.post('/service-plan', {
      kind: 'bible',
      refId: 'rvr1909:JHN.3.16-18',
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({
      kind: 'bible',
      refId: 'rvr1909:JHN.3.16-18',
    });

    for (const refId of [
      'rvr1909:JHN.3.36-40',
      'rvr1909:XXX.1.1',
      'nvi:JHN.3.16',
      'Juan 3:16',
    ]) {
      const rejected = await api.post('/service-plan', {
        kind: 'bible',
        refId,
      });
      expect(rejected.status, refId).toBe(400);
      expect(rejected.body.errors.refId, refId).toBe('Ese pasaje no existe.');
    }

    expect((await api.get('/service-plan')).body.data).toHaveLength(1);
  });
});
