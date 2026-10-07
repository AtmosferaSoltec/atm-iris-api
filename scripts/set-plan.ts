/**
 * Asigna un plan a la iglesia de una cuenta (por ahora sin pasarela de pago:
 * lo hace el dueno del sistema). Cambia la cuota de multimedia; los archivos
 * ya subidos no se tocan.
 *
 * Uso:
 *   pnpm db:set-plan persona@iglesia.org plus
 *   pnpm db:set-plan persona@iglesia.org free
 *
 * Planes: ver src/modules/church/plans.ts.
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { isPlanCode, PLANS } from '../src/modules/church/plans.js';

const [email, plan] = process.argv.slice(2);

if (!email || !plan || !isPlanCode(plan)) {
  console.error(
    `Uso: pnpm db:set-plan <correo de la cuenta> <${Object.keys(PLANS).join('|')}>`,
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL! },
    { schema: 'iris' },
  ),
});

try {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { churchId: true, church: { select: { name: true } } },
  });
  if (!user) throw new Error(`No hay ninguna cuenta con el correo ${email}.`);

  await prisma.church.update({
    where: { id: user.churchId },
    data: { storageQuotaBytes: BigInt(PLANS[plan].quotaBytes) },
  });
  console.log(
    `${user.church.name}: plan ${PLANS[plan].name} (${PLANS[plan].quotaBytes} bytes).`,
  );
} finally {
  await prisma.$disconnect();
}
