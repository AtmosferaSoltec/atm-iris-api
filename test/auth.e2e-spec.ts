import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import {
  cleanUp,
  createTestApp,
  PASSWORD,
  signUp,
  uniqueEmail,
  type CapturingMail,
} from './helpers.js';

const AUTH = '/api/v1/auth';

describe('auth (e2e)', () => {
  let app: NestExpressApplication;
  let mail: CapturingMail;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, mail, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanUp(prisma);
    await app.close();
  });

  describe('crear cuenta', () => {
    it('crea iglesia, dueno y sesion, y /me la devuelve', async () => {
      const account = await signUp(app, {
        platform: 'windows',
        deviceName: 'PC del templo',
      });

      const me = await http()
        .get(`${AUTH}/me`)
        .set('Authorization', `Bearer ${account.accessToken}`);

      expect(me.status).toBe(200);
      expect(me.body.data).toMatchObject({
        user: { email: account.email, fullName: 'Persona de Prueba' },
        church: { name: 'Iglesia de Prueba' },
        role: 'owner',
        session: { platform: 'windows', deviceName: 'PC del templo' },
      });
    });

    it('rechaza un correo repetido aunque cambien mayusculas y espacios', async () => {
      const account = await signUp(app);

      const response = await http()
        .post(`${AUTH}/sign-up`)
        .send({
          churchName: 'Otra',
          fullName: 'Otra persona',
          email: `  ${account.email.toUpperCase()} `,
          password: PASSWORD,
          client: { platform: 'web' },
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EMAIL_TAKEN');
    });

    it('devuelve un error por campo cuando faltan datos', async () => {
      const response = await http()
        .post(`${AUTH}/sign-up`)
        .send({ client: { platform: 'web' } });

      expect(response.status).toBe(400);
      expect(response.body.errors).toMatchObject({
        churchName: expect.any(String),
        fullName: expect.any(String),
        email: expect.any(String),
        password: expect.any(String),
      });
    });
  });

  describe('iniciar sesion', () => {
    it('abre una sesion nueva por dispositivo', async () => {
      const account = await signUp(app);

      const response = await http()
        .post(`${AUTH}/sign-in`)
        .send({
          email: account.email,
          password: PASSWORD,
          client: { platform: 'web' },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.session.id).not.toBe(account.session.id);
      expect(response.body.data.session.platform).toBe('web');
    });

    it('responde igual a un correo inexistente que a una contrasena mala', async () => {
      const account = await signUp(app);

      const [wrong, missing] = await Promise.all([
        http()
          .post(`${AUTH}/sign-in`)
          .send({
            email: account.email,
            password: 'mala',
            client: { platform: 'web' },
          }),
        http()
          .post(`${AUTH}/sign-in`)
          .send({
            email: uniqueEmail('nadie'),
            password: 'mala',
            client: { platform: 'web' },
          }),
      ]);

      expect(wrong.status).toBe(401);
      expect(missing.status).toBe(401);
      expect(wrong.body.message).toBe(missing.body.message);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rechaza peticiones sin token o con uno inventado', async () => {
      expect((await http().get(`${AUTH}/me`)).status).toBe(401);
      expect(
        (
          await http()
            .get(`${AUTH}/me`)
            .set('Authorization', 'Bearer inventado')
        ).status,
      ).toBe(401);
    });
  });

  describe('refresh', () => {
    it('rota el token y renueva los 60 dias', async () => {
      const account = await signUp(app);

      const response = await http()
        .post(`${AUTH}/refresh`)
        .send({ refreshToken: account.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.refreshToken).not.toBe(account.refreshToken);
      const days =
        (new Date(response.body.data.refreshTokenExpiresAt).getTime() -
          Date.now()) /
        86_400_000;
      expect(Math.round(days)).toBe(60);
    });

    it('dos refresh simultaneos con el mismo token terminan con el mismo token', async () => {
      const account = await signUp(app);

      const [first, second] = await Promise.all([
        http()
          .post(`${AUTH}/refresh`)
          .send({ refreshToken: account.refreshToken }),
        http()
          .post(`${AUTH}/refresh`)
          .send({ refreshToken: account.refreshToken }),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.data.refreshToken).toBe(second.body.data.refreshToken);
    });

    it('reusar un token viejo revoca la sesion entera', async () => {
      const account = await signUp(app);
      const first = await http()
        .post(`${AUTH}/refresh`)
        .send({ refreshToken: account.refreshToken });
      const second = await http()
        .post(`${AUTH}/refresh`)
        .send({ refreshToken: first.body.data.refreshToken });

      // Dos generaciones atras: ya no es la gracia, es una copia.
      const reuse = await http()
        .post(`${AUTH}/refresh`)
        .send({ refreshToken: account.refreshToken });
      expect(reuse.status).toBe(401);
      expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');

      const legit = await http()
        .post(`${AUTH}/refresh`)
        .send({ refreshToken: second.body.data.refreshToken });
      expect(legit.status).toBe(401);

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: account.session.id },
      });
      expect(session.revokedReason).toBe('TOKEN_REUSE');
    });
  });

  describe('cerrar sesion', () => {
    it('corta el access token al instante', async () => {
      const account = await signUp(app);
      const bearer = `Bearer ${account.accessToken}`;

      expect(
        (await http().post(`${AUTH}/sign-out`).set('Authorization', bearer))
          .status,
      ).toBe(204);
      expect(
        (await http().get(`${AUTH}/me`).set('Authorization', bearer)).status,
      ).toBe(401);
      expect(
        (
          await http()
            .post(`${AUTH}/refresh`)
            .send({ refreshToken: account.refreshToken })
        ).status,
      ).toBe(401);
    });

    it('en todos los dispositivos cierra tambien los demas', async () => {
      const account = await signUp(app, { platform: 'ios' });
      const other = await http()
        .post(`${AUTH}/sign-in`)
        .send({
          email: account.email,
          password: PASSWORD,
          client: { platform: 'windows' },
        });

      await http()
        .post(`${AUTH}/sign-out-all`)
        .set('Authorization', `Bearer ${other.body.data.accessToken}`);

      expect(
        (
          await http()
            .get(`${AUTH}/me`)
            .set('Authorization', `Bearer ${account.accessToken}`)
        ).status,
      ).toBe(401);
    });
  });

  describe('recuperar contrasena', () => {
    it('recorre los 3 pasos y cierra todas las sesiones', async () => {
      const account = await signUp(app);

      const step1 = await http()
        .post(`${AUTH}/forgot-password`)
        .send({ email: account.email });
      expect(step1.status).toBe(200);
      const code = mail.lastCodeFor(account.email);
      expect(code).toMatch(/^\d{6}$/);

      const step2 = await http()
        .post(`${AUTH}/verify-reset-code`)
        .send({ email: account.email, code });
      expect(step2.body.data).toEqual({ valid: true });

      const step3 = await http().post(`${AUTH}/reset-password`).send({
        email: account.email,
        code,
        password: 'contrasena-nueva-1',
        passwordConfirmation: 'contrasena-nueva-1',
      });
      expect(step3.status).toBe(200);

      // La sesion que existia se cerro, y el aviso salio.
      expect(
        (
          await http()
            .get(`${AUTH}/me`)
            .set('Authorization', `Bearer ${account.accessToken}`)
        ).status,
      ).toBe(401);
      expect(
        mail.passwordChanged.some((entry) => entry.to === account.email),
      ).toBe(true);

      // Solo la contrasena nueva sirve, y el codigo ya no.
      const oldPassword = await http()
        .post(`${AUTH}/sign-in`)
        .send({
          email: account.email,
          password: PASSWORD,
          client: { platform: 'web' },
        });
      const newPassword = await http()
        .post(`${AUTH}/sign-in`)
        .send({
          email: account.email,
          password: 'contrasena-nueva-1',
          client: { platform: 'web' },
        });
      const reusedCode = await http()
        .post(`${AUTH}/verify-reset-code`)
        .send({ email: account.email, code });
      expect(oldPassword.status).toBe(401);
      expect(newPassword.status).toBe(200);
      expect(reusedCode.body.code).toBe('RESET_CODE_INVALID');
    });

    it('responde igual exista o no la cuenta', async () => {
      const account = await signUp(app);

      const [known, unknown] = await Promise.all([
        http().post(`${AUTH}/forgot-password`).send({ email: account.email }),
        http()
          .post(`${AUTH}/forgot-password`)
          .send({ email: uniqueEmail('nadie') }),
      ]);

      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
    });

    it('quema el codigo despues de 5 intentos fallidos', async () => {
      const account = await signUp(app);
      await http()
        .post(`${AUTH}/forgot-password`)
        .send({ email: account.email });
      const code = mail.lastCodeFor(account.email);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await http()
          .post(`${AUTH}/verify-reset-code`)
          .send({ email: account.email, code: wrong });
      }

      const response = await http()
        .post(`${AUTH}/verify-reset-code`)
        .send({ email: account.email, code });
      expect(response.body.code).toBe('RESET_LIMIT_REACHED');
    });
  });
});
