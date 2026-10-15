/**
 * Publica la version de una app: desde ahora, las apps anteriores deben actualizarse para continuar.
 * Hazlo SOLO cuando la version nueva ya se puede descargar (instalador subido, o build aprobado en
 * TestFlight/App Store); si no, bloqueas a las iglesias sin salida.
 *
 * Uso:
 *   pnpm db:set-app-version windows 1.0.1
 *   pnpm db:set-app-version ios 1.0.1 https://testflight.apple.com/join/XXXX "Mejoras en la consola"
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { VERSION_PATTERN } from '../src/modules/app-versions/dto/app-versions.schema.js';

const [platform, version, downloadUrl, notes] = process.argv.slice(2);

if (
  (platform !== 'ios' && platform !== 'windows') ||
  !version ||
  !VERSION_PATTERN.test(version)
) {
  console.error(
    'Uso: pnpm db:set-app-version <ios|windows> <version, ej. 1.0.1> [url de descarga] [notas]',
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
  const row = await prisma.appVersion.upsert({
    where: { platform },
    create: {
      platform,
      version,
      downloadUrl: downloadUrl ?? null,
      notes: notes ?? null,
    },
    update: {
      version,
      // Sin argumento se conserva lo que ya habia.
      ...(downloadUrl !== undefined && { downloadUrl }),
      ...(notes !== undefined && { notes }),
    },
  });
  console.log(`${row.platform}: version publicada ${row.version}.`);
} finally {
  await prisma.$disconnect();
}
