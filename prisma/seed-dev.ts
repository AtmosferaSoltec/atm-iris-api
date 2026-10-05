/**
 * Datos de ejemplo para desarrollo: la iglesia y el pastor de la maqueta
 * (docs/BACKEND_SPEC.md §2.4), para entrar desde la web o las consolas sin
 * registrarse cada vez.
 *
 * Idempotente: si el correo ya existe, no toca nada. Se niega a correr en
 * produccion.
 *
 * Uso: pnpm db:seed:dev
 */
import 'dotenv/config';

import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

const EMAIL = 'pastor@vidanueva.org';
const PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'vidanueva123';

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-dev no corre en produccion.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }, { schema: 'iris' }),
});

try {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (existing) {
    console.log(`${EMAIL} ya existe; no se cambio nada.`);
  } else {
    await prisma.$transaction(async (tx) => {
      const church = await tx.church.create({ data: { name: 'Iglesia Vida Nueva' } });
      const user = await tx.user.create({
        data: { email: EMAIL, fullName: 'Daniel Ruiz', passwordHash: await hash(PASSWORD) },
      });
      await tx.churchMember.create({
        data: { churchId: church.id, userId: user.id, role: 'OWNER' },
      });
    });
    console.log(`Creado ${EMAIL} / ${PASSWORD} en Iglesia Vida Nueva.`);
  }
} finally {
  await prisma.$disconnect();
}
