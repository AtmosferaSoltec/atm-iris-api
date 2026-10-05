import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { StoragePort } from '../src/integrations/storage/storage.port.js';
import { authed, cleanUp, createTestApp, isStorageUp, signUp } from './helpers.js';

const storageUp = await isStorageUp();

// Sin MinIO no hay donde subir: se salta con el motivo en el nombre.
describe.runIf(storageUp)('multimedia (e2e, requiere MinIO)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const objectKeys: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    // Los objetos que dejo la prueba no los borra la cascada de la base.
    const storage = app.get(StoragePort);
    for (const key of objectKeys) await storage.deleteObject(key).catch(() => undefined);
    await cleanUp(prisma);
    await app.close();
  });

  it('ticket → PUT → confirmar → download-url devuelve el mismo archivo', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);
    const bytes = Buffer.from(`imagen de prueba ${Date.now()}`.repeat(50));

    const ticket = await api.post('/media/uploads', {
      kind: 'image',
      fileName: 'Fondo de prueba.png',
      contentType: 'image/png',
      sizeBytes: bytes.length,
    });
    expect(ticket.status).toBe(201);
    expect(ticket.body.data.headers).toEqual({ 'Content-Type': 'image/png' });

    const put = await fetch(ticket.body.data.uploadUrl, {
      method: 'PUT',
      headers: ticket.body.data.headers,
      body: bytes,
    });
    expect(put.status).toBe(200);

    const confirmed = await api.post('/media', {
      uploadId: ticket.body.data.uploadId,
      title: 'Fondo de prueba',
      width: 1920,
      height: 1080,
      durationSeconds: 12,
      isBackground: true,
    });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data).toMatchObject({
      id: ticket.body.data.uploadId,
      kind: 'image',
      sizeBytes: bytes.length,
      isBackground: true,
      // Una imagen no tiene duracion.
      durationSeconds: null,
      description: null,
    });
    const asset = await prisma.mediaAsset.findUnique({ where: { id: confirmed.body.data.id } });
    objectKeys.push(asset!.objectKey);

    const download = await api.get(`/media/${confirmed.body.data.id}/download-url`);
    const file = await fetch(download.body.data.url);
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);

    const church = await api.get('/church');
    expect(church.body.data.storage.usedBytes).toBe(bytes.length);

    const backgrounds = await api.get('/media?isBackground=true');
    expect(backgrounds.body.meta.total).toBe(1);

    await api.delete(`/media/${confirmed.body.data.id}`);
    expect((await api.get('/church')).body.data.storage.usedBytes).toBe(0);
  });

  it('valida tipo, tamaño, cuota y que el archivo haya llegado', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);

    const gif = await api.post('/media/uploads', {
      kind: 'image',
      fileName: 'a.gif',
      contentType: 'image/gif',
      sizeBytes: 10,
    });
    expect(gif.status).toBe(415);
    expect(gif.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const big = await api.post('/media/uploads', {
      kind: 'audio',
      fileName: 'a.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 201 * 1024 * 1024,
    });
    expect(big.body.code).toBe('FILE_TOO_LARGE');

    await prisma.church.update({
      where: { id: owner.church.id },
      data: { storageQuotaBytes: 1000n },
    });
    const first = await api.post('/media/uploads', {
      kind: 'image',
      fileName: 'a.png',
      contentType: 'image/png',
      sizeBytes: 600,
    });
    expect(first.status).toBe(201);
    const second = await api.post('/media/uploads', {
      kind: 'image',
      fileName: 'b.png',
      contentType: 'image/png',
      sizeBytes: 600,
    });
    expect(second.body.code).toBe('STORAGE_QUOTA_EXCEEDED');

    // Confirmar sin haber subido el archivo.
    const missing = await api.post('/media', { uploadId: first.body.data.uploadId, title: 'x' });
    expect(missing.body.code).toBe('UPLOAD_NOT_FOUND');
  });
});

describe.skipIf(storageUp)('multimedia (e2e)', () => {
  it.skip('saltada: MinIO no responde (docker compose -f docker-compose.dev.yml up -d)', () => {});
});
