import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { StoragePort } from '../src/integrations/storage/storage.port.js';
import { MediaCleanupService } from '../src/modules/media/media-cleanup.service.js';
import {
  authed,
  cleanUp,
  createTestApp,
  isStorageUp,
  signUp,
} from './helpers.js';

const storageUp = await isStorageUp();

// La pista de una cancion es un audio de multimedia: sin MinIO no se puede subir.
describe.runIf(storageUp)('canciones con pista (e2e, requiere MinIO)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const objectKeys: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    const storage = app.get(StoragePort);
    for (const key of objectKeys)
      await storage.deleteObject(key).catch(() => undefined);
    await cleanUp(prisma);
    await app.close();
  });

  async function uploadAudio(api: ReturnType<typeof authed>, title: string) {
    const bytes = Buffer.from(`audio ${title} ${Date.now()}`.repeat(40));
    const ticket = await api.post('/media/uploads', {
      kind: 'audio',
      fileName: `${title}.mp3`,
      contentType: 'audio/mpeg',
      sizeBytes: bytes.length,
    });
    await fetch(ticket.body.data.uploadUrl, {
      method: 'PUT',
      headers: ticket.body.data.headers,
      body: bytes,
    });
    const confirmed = await api.post('/media', {
      uploadId: ticket.body.data.uploadId,
      title,
      durationSeconds: 215,
    });
    expect(confirmed.status).toBe(201);
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: confirmed.body.data.id },
    });
    objectKeys.push(asset!.objectKey);
    return { id: confirmed.body.data.id as string, size: bytes.length };
  }

  it('letra, pista o ambas; la pista es de una sola cancion y se va con ella', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    // Ni letra ni pista: no es una cancion.
    const empty = await api.post('/songs', {
      title: 'Vacía',
      author: '',
      sections: [],
    });
    expect(empty.status).toBe(400);
    expect(empty.body.errors.sections).toBe('Agrega la letra o una pista.');

    const first = await uploadAudio(api, 'Hoy te salvo');
    const onlyTrack = await api.post('/songs', {
      title: 'Hoy te salvo',
      author: 'Pedro Márquez',
      sections: [],
      audioId: first.id,
    });
    expect(onlyTrack.status).toBe(201);
    expect(onlyTrack.body.data).toMatchObject({
      sections: [],
      audio: { id: first.id, kind: 'audio', durationSeconds: 215 },
    });

    const list = await api.get('/songs?search=hoy');
    expect(list.body.data[0]).toMatchObject({
      sectionCount: 0,
      firstLine: null,
      audio: { id: first.id },
    });

    // Uno a uno: otra cancion no puede usar la misma pista.
    const stolen = await api.post('/songs', {
      title: 'Copia',
      author: '',
      sections: [{ label: null, text: 'otra' }],
      audioId: first.id,
    });
    expect(stolen.status).toBe(400);
    expect(stolen.body.errors.audioId).toBe('Esa pista ya es de otra canción.');

    // Una imagen no es una pista.
    expect(
      (
        await api.post('/songs', {
          title: 'Mal',
          author: '',
          sections: [],
          audioId: '01a10cb0-1d73-709f-b03e-c6c9c36a17f0',
        })
      ).body.errors.audioId,
    ).toBe('Esa pista no existe.');

    // Cambiar la pista borra la anterior y libera su espacio.
    const second = await uploadAudio(api, 'Hoy te salvo (pista)');
    const replaced = await api.put(`/songs/${onlyTrack.body.data.id}`, {
      title: 'Hoy te salvo',
      author: 'Pedro Márquez',
      sections: [{ label: 'Coro', text: 'Hoy te salvo' }],
      audioId: second.id,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.audio.id).toBe(second.id);
    expect((await api.get(`/media/${first.id}`)).status).toBe(404);
    expect((await api.get('/church')).body.data.storage.usedBytes).toBe(
      second.size,
    );

    // El plan recibe la cancion (con su pista), nunca la pista suelta.
    const looseTrack = await api.post('/service-plan', {
      kind: 'media',
      refId: second.id,
    });
    expect(looseTrack.status).toBe(400);
    expect(looseTrack.body.errors.refId).toBe(
      'Las pistas se agregan con su canción.',
    );
    expect(
      (
        await api.post('/service-plan', {
          kind: 'song',
          refId: onlyTrack.body.data.id,
        })
      ).status,
    ).toBe(201);

    const sync = await api.get('/sync/changes?since=0');
    const synced = sync.body.data.changes.songs.find(
      (song: { id: string }) => song.id === onlyTrack.body.data.id,
    );
    expect(synced.audio.id).toBe(second.id);

    // Borrar la cancion borra su pista y su lugar en el plan.
    expect((await api.delete(`/songs/${onlyTrack.body.data.id}`)).status).toBe(
      204,
    );
    expect((await api.get(`/media/${second.id}`)).status).toBe(404);
    expect((await api.get('/church')).body.data.storage.usedBytes).toBe(0);
    expect((await api.get('/service-plan')).body.data).toHaveLength(0);
  });

  it('la pista en YouTube: solo el id, sin cuota; reemplaza al audio subido', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const song = await api.post('/songs', {
      title: 'Gracias',
      author: 'Hillsong',
      sections: [],
      youtubeId: 'aqz-KE-bpKQ',
    });
    expect(song.status).toBe(201);
    expect(song.body.data).toMatchObject({
      sections: [],
      audio: null,
      youtubeId: 'aqz-KE-bpKQ',
      youtubeMusic: false,
    });

    // De YouTube Music: solo cambia como se muestra.
    const music = await api.post('/songs', {
      title: 'Mi roca',
      author: '',
      sections: [],
      youtubeId: 'aqz-KE-bpKQ',
      youtubeMusic: true,
    });
    expect(music.body.data.youtubeMusic).toBe(true);
    const lyricsOnly = await api.put(`/songs/${music.body.data.id}`, {
      title: 'Mi roca',
      author: '',
      sections: [{ label: null, text: 'Mi roca' }],
      youtubeMusic: true,
    });
    expect(lyricsOnly.body.data).toMatchObject({
      youtubeId: null,
      youtubeMusic: false,
    });
    expect(
      (await api.get('/songs?search=gracias')).body.data[0].youtubeId,
    ).toBe('aqz-KE-bpKQ');

    const malformed = await api.put(`/songs/${song.body.data.id}`, {
      title: 'Gracias',
      author: '',
      sections: [],
      youtubeId: 'https://youtu.be/aqz-KE-bpKQ',
    });
    expect(malformed.body.errors.youtubeId).toBe(
      'Ese no es un video de YouTube.',
    );

    const audio = await uploadAudio(api, 'Gracias (pista)');
    const both = await api.put(`/songs/${song.body.data.id}`, {
      title: 'Gracias',
      author: '',
      sections: [],
      audioId: audio.id,
      youtubeId: 'aqz-KE-bpKQ',
    });
    expect(both.status).toBe(400);
    expect(both.body.errors.youtubeId).toBe(
      'La pista es un audio o un video de YouTube, no los dos.',
    );

    // Del audio subido a YouTube: el audio se borra y libera el espacio.
    await api.put(`/songs/${song.body.data.id}`, {
      title: 'Gracias',
      author: '',
      sections: [],
      audioId: audio.id,
    });
    const toYouTube = await api.put(`/songs/${song.body.data.id}`, {
      title: 'Gracias',
      author: '',
      sections: [],
      youtubeId: 'aqz-KE-bpKQ',
    });
    expect(toYouTube.body.data).toMatchObject({
      audio: null,
      youtubeId: 'aqz-KE-bpKQ',
    });
    expect((await api.get(`/media/${audio.id}`)).status).toBe(404);
    expect((await api.get('/church')).body.data.storage.usedBytes).toBe(0);
  });

  it('borrar la pista desde multimedia: queda la letra, o se va la cancion si era solo pista', async () => {
    const api = authed(app, (await signUp(app)).accessToken);

    const withLyrics = await uploadAudio(api, 'Con letra');
    const song = await api.post('/songs', {
      title: 'Con letra',
      author: '',
      sections: [{ label: null, text: 'Aleluya' }],
      audioId: withLyrics.id,
    });
    expect((await api.delete(`/media/${withLyrics.id}`)).status).toBe(204);
    const kept = await api.get(`/songs/${song.body.data.id}`);
    expect(kept.body.data).toMatchObject({ audio: null });
    expect(kept.body.data.sections).toHaveLength(1);

    const alone = await uploadAudio(api, 'Solo pista');
    const trackOnly = await api.post('/songs', {
      title: 'Solo pista',
      author: '',
      sections: [],
      audioId: alone.id,
    });
    await api.post('/service-plan', {
      kind: 'song',
      refId: trackOnly.body.data.id,
    });
    expect((await api.delete(`/media/${alone.id}`)).status).toBe(204);
    expect((await api.get(`/songs/${trackOnly.body.data.id}`)).status).toBe(
      404,
    );
    expect((await api.get('/service-plan')).body.data).toHaveLength(0);
  });

  it('la limpieza horaria borra las pistas que ninguna cancion uso en 24 h', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const orphan = await uploadAudio(api, 'Nunca guardada');
    const used = await uploadAudio(api, 'Guardada');
    await api.post('/songs', {
      title: 'Guardada',
      author: '',
      sections: [],
      audioId: used.id,
    });

    const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.mediaAsset.updateMany({
      where: { id: { in: [orphan.id, used.id] } },
      data: { createdAt: dayAgo },
    });
    await app.get(MediaCleanupService).run();

    expect((await api.get(`/media/${orphan.id}`)).status).toBe(404);
    expect((await api.get(`/media/${used.id}`)).status).toBe(200);
  });
});
