import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaService } from '../src/database/prisma.service.js';
import {
  authed,
  cleanUp,
  createTestApp,
  inviteNewMember,
  PASSWORD,
  signUp,
  uniqueEmail,
  type CapturingMail,
} from './helpers.js';

describe('equipo (e2e)', () => {
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

  it('sign-up entrega owner, los 9 permisos y una iglesia', async () => {
    const owner = await signUp(app);
    const me = await authed(app, owner.accessToken).get('/auth/me');

    expect(me.body.data).toMatchObject({
      role: 'owner',
      church: { timezone: 'America/Lima' },
      churches: [{ id: owner.church.id, role: 'owner' }],
    });
    expect(me.body.data.permissions).toHaveLength(9);
  });

  it('invitar → lookup → aceptar con cuenta nueva', async () => {
    const owner = await signUp(app);
    const email = uniqueEmail('nuevo');
    const invited = await authed(app, owner.accessToken).post('/invitations', {
      email,
      role: 'operator',
    });
    expect(invited.status).toBe(201);
    expect(invited.body.data).toMatchObject({ email, role: 'operator' });

    const token = mail.lastInvitationTokenFor(email);
    const lookup = await http().get(`/api/v1/invitations/lookup?token=${token}`);
    expect(lookup.body.data).toMatchObject({
      churchName: 'Iglesia de Prueba',
      email,
      role: 'operator',
      hasAccount: false,
    });

    const accepted = await http()
      .post('/api/v1/invitations/accept')
      .send({ token, fullName: 'Nuevo', password: PASSWORD, client: { platform: 'web' } });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({
      role: 'operator',
      permissions: ['people.manage', 'records.write'],
    });

    const reused = await http()
      .post('/api/v1/invitations/accept')
      .send({ token, fullName: 'Nuevo', password: PASSWORD, client: { platform: 'web' } });
    expect(reused.body.code).toBe('INVITATION_INVALID');
  });

  it('un operator recibe 403 al invitar', async () => {
    const owner = await signUp(app);
    const operator = await inviteNewMember(app, mail, owner.accessToken, 'operator');
    const response = await authed(app, operator.accessToken).post('/invitations', {
      email: uniqueEmail('x'),
      role: 'operator',
    });
    expect(response.status).toBe(403);
  });

  it('cuenta existente acepta, queda con dos iglesias y switch-church alterna', async () => {
    const alfa = await signUp(app);
    const beta = await signUp(app);

    await authed(app, alfa.accessToken).post('/invitations', { email: beta.email, role: 'admin' });
    const token = mail.lastInvitationTokenFor(beta.email);

    const lookup = await http().get(`/api/v1/invitations/lookup?token=${token}`);
    expect(lookup.body.data.hasAccount).toBe(true);

    const accepted = await http()
      .post('/api/v1/invitations/accept')
      .send({ token, password: PASSWORD, client: { platform: 'windows' } });
    expect(accepted.body.data).toMatchObject({ church: { id: alfa.church.id }, role: 'admin' });
    expect(accepted.body.data.churches).toHaveLength(2);

    const back = await authed(app, accepted.body.data.accessToken).post('/auth/switch-church', {
      churchId: beta.church.id,
    });
    expect(back.body.data).toMatchObject({ church: { id: beta.church.id }, role: 'owner' });

    // El access token anterior apuntaba a la otra iglesia: ya no sirve.
    const stale = await authed(app, accepted.body.data.accessToken).get('/auth/me');
    expect(stale.status).toBe(401);
  });

  it('LAST_OWNER, admin contra owner, y quitar a alguien corta su acceso', async () => {
    const owner = await signUp(app);
    const admin = await inviteNewMember(app, mail, owner.accessToken, 'admin');
    const operator = await inviteNewMember(app, mail, owner.accessToken, 'operator');

    const members = (await authed(app, owner.accessToken).get('/members')).body.data as {
      id: string;
      role: string;
      isCurrentUser: boolean;
    }[];
    expect(members).toHaveLength(3);
    const self = members.find((m) => m.isCurrentUser)!;
    const operatorMember = members.find((m) => m.role === 'operator')!;

    const demote = await authed(app, owner.accessToken).patch(`/members/${self.id}`, {
      role: 'admin',
    });
    expect(demote.body.code).toBe('LAST_OWNER');

    const adminOnOwner = await authed(app, admin.accessToken).delete(`/members/${self.id}`);
    expect(adminOnOwner.status).toBe(403);

    expect((await authed(app, operator.accessToken).get('/auth/me')).status).toBe(200);
    const removed = await authed(app, admin.accessToken).delete(`/members/${operatorMember.id}`);
    expect(removed.status).toBe(204);
    expect((await authed(app, operator.accessToken).get('/auth/me')).status).toBe(401);
  });

  it('reinvitar reemplaza la pendiente y ALREADY_MEMBER para miembros', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);
    const email = uniqueEmail('dos-veces');

    await api.post('/invitations', { email, role: 'operator' });
    await api.post('/invitations', { email, role: 'admin' });
    const pending = (await api.get('/invitations')).body.data as { email: string; role: string }[];
    expect(pending.filter((i) => i.email === email)).toEqual([
      expect.objectContaining({ role: 'admin' }),
    ]);

    const again = await api.post('/invitations', { email: owner.email, role: 'admin' });
    expect(again.body.code).toBe('ALREADY_MEMBER');
  });

  it('perfil, cambio de contrasena y dispositivos', async () => {
    const owner = await signUp(app);
    const api = authed(app, owner.accessToken);

    const renamed = await api.patch('/auth/me', { fullName: 'Nombre Nuevo' });
    expect(renamed.body.data.user.fullName).toBe('Nombre Nuevo');

    const other = await http()
      .post('/api/v1/auth/sign-in')
      .send({ email: owner.email, password: PASSWORD, client: { platform: 'web' } });

    const sessions = (await api.get('/auth/sessions')).body.data as { isCurrent: boolean }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);

    const wrong = await api.post('/auth/change-password', {
      currentPassword: 'no-es',
      password: 'nueva-clave-123',
      passwordConfirmation: 'nueva-clave-123',
    });
    expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');

    const changed = await api.post('/auth/change-password', {
      currentPassword: PASSWORD,
      password: 'nueva-clave-123',
      passwordConfirmation: 'nueva-clave-123',
    });
    expect(changed.status).toBe(204);
    expect((await api.get('/auth/me')).status).toBe(200);
    expect((await authed(app, other.body.data.accessToken).get('/auth/me')).status).toBe(401);
    expect(mail.passwordChanged.some((m) => m.to === owner.email)).toBe(true);
  });
});
