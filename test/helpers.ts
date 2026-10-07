import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  MailPort,
  type PasswordChangedMail,
  type PasswordResetCodeMail,
} from '../src/integrations/mail/mail.port.js';

/** Correo de mentira: guarda lo enviado para que la prueba lea el codigo. */
export class CapturingMail extends MailPort {
  readonly resetCodes: PasswordResetCodeMail[] = [];
  readonly passwordChanged: PasswordChangedMail[] = [];

  async sendPasswordResetCode(input: PasswordResetCodeMail): Promise<void> {
    this.resetCodes.push(input);
  }

  async sendPasswordChanged(input: PasswordChangedMail): Promise<void> {
    this.passwordChanged.push(input);
  }

  lastCodeFor(email: string): string {
    const mail = this.resetCodes.findLast((entry) => entry.to === email);
    if (!mail) throw new Error(`No se envio ningun codigo a ${email}`);
    return mail.code;
  }
}

export async function createTestApp() {
  const mail = new CapturingMail();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailPort)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app, app.get(ConfigService<Env, true>));
  await app.init();

  return { app, mail, prisma: app.get(PrismaService) };
}

/**
 * Correos unicos por corrida, bajo un dominio reservado para pruebas. Asi las
 * pruebas no chocan con datos de desarrollo y `cleanUp` sabe que borrar.
 */
export const TEST_DOMAIN = 'e2e.iris.test';
export const uniqueEmail = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@${TEST_DOMAIN}`;

export async function cleanUp(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
  });
  const churchIds = users.map((user) => user.churchId);

  // Las sesiones y los codigos caen en cascada.
  await prisma.user.deleteMany({
    where: { id: { in: users.map((u) => u.id) } },
  });
  await prisma.church.deleteMany({ where: { id: { in: churchIds } } });
}

export const PASSWORD = 'clave-de-prueba-123';

export async function signUp(
  app: NestExpressApplication,
  overrides: Partial<{
    email: string;
    platform: string;
    deviceName: string;
  }> = {},
) {
  const email = overrides.email ?? uniqueEmail('owner');
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/sign-up')
    .send({
      churchName: 'Iglesia de Prueba',
      fullName: 'Persona de Prueba',
      email,
      password: PASSWORD,
      client: {
        platform: overrides.platform ?? 'ios',
        deviceName: overrides.deviceName,
      },
    });

  if (response.status !== 201) {
    throw new Error(
      `sign-up fallo (${response.status}): ${JSON.stringify(response.body)}`,
    );
  }

  return { email, ...response.body.data } as {
    email: string;
    accessToken: string;
    refreshToken: string;
    session: { id: string };
    church: { id: string; name: string };
  };
}

/** Peticiones con el access token ya puesto. */
export function authed(app: NestExpressApplication, token: string) {
  const server = app.getHttpServer();
  const bearer = `Bearer ${token}`;
  return {
    get: (path: string) => request(server).get(`/api/v1${path}`).set('Authorization', bearer),
    post: (path: string, body?: object) =>
      request(server).post(`/api/v1${path}`).set('Authorization', bearer).send(body),
    put: (path: string, body?: object) =>
      request(server).put(`/api/v1${path}`).set('Authorization', bearer).send(body),
    patch: (path: string, body?: object) =>
      request(server).patch(`/api/v1${path}`).set('Authorization', bearer).send(body),
    delete: (path: string) =>
      request(server).delete(`/api/v1${path}`).set('Authorization', bearer),
  };
}

/** Si MinIO (o el almacenamiento configurado) responde. Para saltar pruebas que lo necesitan. */
export async function isStorageUp(): Promise<boolean> {
  const endpoint = process.env.STORAGE_ENDPOINT;
  if (!endpoint || !process.env.STORAGE_ACCESS_KEY_ID) return false;
  try {
    const response = await fetch(new URL('/minio/health/live', endpoint), {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Si la Biblia esta importada (`pnpm db:import-bible`). */
export async function isBibleImported(): Promise<boolean> {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../src/generated/prisma/client.js');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }, { schema: 'iris' }),
  });
  try {
    return (await prisma.bibleTranslation.count({ where: { code: 'rvr1909' } })) > 0;
  } finally {
    await prisma.$disconnect();
  }
}
