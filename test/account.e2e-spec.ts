import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import { StoragePort } from '../src/integrations/storage/storage.port.js';
import { authed, cleanUp, createTestApp, PASSWORD, signUp } from './helpers.js';

const AUTH = '/api/v1/auth';

describe('borrar cuenta (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  it('con contraseña mal no borra nada; con la buena borra la iglesia, sus archivos y deja volver a registrarse vacío', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);
    expect((await api.post('/songs', SONG)).status).toBe(201);

    // Sin almacenamiento real en esta prueba: se mira el prefijo que se pide borrar.
    const storage = app.get(StoragePort);
    const deletePrefix = vi.spyOn(storage, 'deletePrefix').mockResolvedValue(0);

    const wrong = await api.post('/auth/delete-account', {
      password: 'otra-clave',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(deletePrefix).not.toHaveBeenCalled();
    expect(
      await prisma.church.findUnique({ where: { id: owner.church.id } }),
    ).not.toBeNull();

    const gone = await api.post('/auth/delete-account', { password: PASSWORD });
    expect(gone.status).toBe(204);
    expect(deletePrefix).toHaveBeenCalledWith(`churches/${owner.church.id}/`);

    // La iglesia, su cuenta, sus sesiones y su contenido ya no están.
    expect(
      await prisma.church.findUnique({ where: { id: owner.church.id } }),
    ).toBeNull();
    expect(await prisma.user.count({ where: { email: owner.email } })).toBe(0);
    expect(
      await prisma.song.count({ where: { churchId: owner.church.id } }),
    ).toBe(0);

    // El token viejo ya no sirve y no se puede volver a entrar con esa cuenta.
    expect((await api.get('/auth/me')).status).toBe(401);
    const signIn = await http()
      .post(`${AUTH}/sign-in`)
      .send({
        email: owner.email,
        password: PASSWORD,
        client: { platform: 'web' },
      });
    expect(signIn.status).toBe(401);

    // Con el mismo correo se registra de nuevo, y empieza sin nada.
    const again = await signUp(app, { email: owner.email });
    const list = await authed(app, again.accessToken).get('/songs');
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(0);

    deletePrefix.mockRestore();
  });
});

const SONG = {
  title: 'Sublime gracia',
  author: 'John Newton',
  sections: [{ label: 'Estrofa 1', text: 'Sublime gracia del Señor' }],
};
