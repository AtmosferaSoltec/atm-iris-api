import type { AddressInfo } from 'node:net';

import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { authed, cleanUp, createTestApp, signUp } from './helpers.js';

describe('pantallas (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let base: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  /** Lee eventos SSE del canal hasta tener `count`. */
  async function readEvents(response: Response, count: number) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const events: { event: string; data: unknown }[] = [];
    let buffer = '';
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
    }
    await reader.cancel();
    return events;
  }

  it('se vincula con un código, recibe lo que manda la consola y se desvincula', async () => {
    const api = authed(app, (await signUp(app)).accessToken);
    const server = app.getHttpServer();

    // El televisor pide un código y pregunta: aún nadie lo vinculó.
    const pairing = (await request(server).post('/api/v1/displays/pairings'))
      .body.data;
    expect(pairing.code).toMatch(/^[A-Z2-9]{6}$/);
    const poll = () =>
      request(server)
        .get(`/api/v1/displays/pairings/${pairing.id}`)
        .set('X-Pairing-Secret', pairing.secret);
    expect((await poll()).body.data).toEqual({ status: 'pending' });
    expect(
      (await request(server).get(`/api/v1/displays/pairings/${pairing.id}`))
        .status,
    ).toBe(404);

    // Un código que no existe no vincula nada.
    const wrong = await api.post('/displays', { code: 'ZZZZZZ', name: 'TV' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors.code).toBe('Ese código no existe o ya venció.');

    // La consola escribe el código (en minúsculas también vale).
    const claimed = await api.post('/displays', {
      code: pairing.code.toLowerCase(),
      name: 'TV del salón',
    });
    expect(claimed.status).toBe(201);
    expect(claimed.body.data).toMatchObject({
      name: 'TV del salón',
      online: false,
    });
    expect(
      (await api.post('/displays', { code: pairing.code, name: 'Otra' }))
        .status,
    ).toBe(400);

    // El televisor recoge su token una sola vez.
    const paired = (await poll()).body.data;
    expect(paired).toMatchObject({
      status: 'paired',
      display: { name: 'TV del salón' },
    });
    expect((await poll()).status).toBe(404);

    // Sin token, no hay canal.
    expect((await fetch(`${base}/displays/stream`)).status).toBe(401);

    // Lo último de la consola llega al abrir el canal; lo nuevo, en vivo.
    await api.put('/displays/state', {
      frame: { content: { kind: 'blank' } },
      clock: 1,
    });
    const stream = await fetch(`${base}/displays/stream`, {
      headers: { Authorization: `Bearer ${paired.token}` },
    });
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const events = readEvents(stream, 2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await api.get('/displays')).body.data[0].online).toBe(true);
    await api.put('/displays/state', {
      frame: { content: { kind: 'text', text: 'Hola' } },
      clock: 2,
    });
    const [state, frame] = await events;
    expect(state).toMatchObject({
      event: 'state',
      data: { frame: { content: { kind: 'blank' } }, preload: [], clock: 1 },
    });
    expect(frame).toMatchObject({
      event: 'frame',
      data: { frame: { content: { kind: 'text', text: 'Hola' } }, clock: 2 },
    });
    // Horas del API para que el televisor corrija el desfase de relojes.
    const data = frame!.data as { receivedAt: number; now: number };
    expect(data.now).toBeGreaterThanOrEqual(data.receivedAt);

    // Desvincularlo corta su token.
    expect((await api.delete(`/displays/${claimed.body.data.id}`)).status).toBe(
      204,
    );
    expect(
      (
        await fetch(`${base}/displays/stream`, {
          headers: { Authorization: `Bearer ${paired.token}` },
        })
      ).status,
    ).toBe(401);
    expect((await api.get('/displays')).body.data).toEqual([]);
  });
});
