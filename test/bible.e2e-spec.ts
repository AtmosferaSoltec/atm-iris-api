import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, isBibleImported, signUp } from './helpers.js';

const imported = await isBibleImported();

describe.runIf(imported)('Biblia (e2e, requiere la RVR1909 importada)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let token: string;

  let port: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    token = (await signUp(app)).accessToken;
  });

  function rawGet(path: string, bearer: string) {
    return new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>(
      (resolve, reject) => {
        get(
          { host: '127.0.0.1', port, path, headers: { Authorization: `Bearer ${bearer}` } },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () =>
              resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }),
            );
          },
        ).on('error', reject);
      },
    );
  }

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('libros y Juan 3:16', async () => {
    const api = authed(app, token);
    const books = await api.get('/bible/translations/rvr1909/books');
    expect(books.body.data).toHaveLength(66);
    expect(books.body.data[42]).toEqual({
      id: 'JHN',
      name: 'Juan',
      testament: 'new',
      chapterCount: 21,
      position: 43,
    });

    const chapter = await api.get('/bible/translations/rvr1909/books/JHN/chapters/3');
    expect(chapter.body.data.verses[15]).toEqual({
      number: 16,
      text: expect.stringMatching(/^Porque de tal manera amó Dios al mundo/),
    });

    expect((await api.get('/bible/translations/rvr1909/books/JHN/chapters/22')).status).toBe(404);
  });

  it('descarga completa comprimida y 304 con el ETag', async () => {
    // `node:http` y no supertest: supertest descomprime solo y no deja medir
    // el cuerpo que de verdad viaja.
    const response = await rawGet('/api/v1/bible/translations/rvr1909/download', token);

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    const etag = response.headers.etag as string;
    expect(etag).toMatch(/^"rvr1909-\d+"$/);

    const body = response.body;
    const { data } = JSON.parse(gunzipSync(body).toString('utf8'));
    expect(data.books).toHaveLength(66);
    expect(data.books[42].chapters[2][15]).toMatch(/^Porque de tal manera/);

    const translations = await authed(app, token).get('/bible/translations');
    expect(translations.body.data[0].sizeBytes).toBe(body.length);

    const cached = await authed(app, token)
      .get('/bible/translations/rvr1909/download')
      .set('If-None-Match', etag);
    expect(cached.status).toBe(304);
  });
});

describe.skipIf(imported)('Biblia (e2e)', () => {
  it.skip('saltada: la Biblia no está importada (ver docs/bible-source.md)', () => {});
});
