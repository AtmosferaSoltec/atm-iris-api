/**
 * Datos de ejemplo para desarrollo: lo mismo que las maquetas (IRIS_SPEC.md §11),
 * para que la web y las consolas se integren contra datos reales.
 *
 * - Iglesia Vida Nueva (America/Lima, modulos encendidos) con pastor (owner),
 *   admin y operador; contrasena `vidanueva123` (o DEV_SEED_PASSWORD).
 * - Iglesia Monte Sion, donde el pastor es admin (para probar el cambio de
 *   iglesia).
 * - 8 personas, 3 tipos de servicio, 6 himnos de dominio publico, 10 registros
 *   de tiempos de los ultimos domingos (uno con un bloque omitido, otro ajustado)
 *   y, si MinIO esta arriba, 2 imagenes de fondo.
 *
 * Idempotente: crea solo lo que falta y no toca lo que ya existe (ni las
 * contrasenas). Se niega a correr en produccion.
 *
 * Uso: pnpm db:seed:dev
 */
import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { objectKeyFor } from '../src/modules/media/media.keys.js';
import { nameKey, searchText } from '../src/shared/utils/text.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-dev no corre en produccion.');
}

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'vidanueva123';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL! },
    { schema: 'iris' },
  ),
});

type Tx = Prisma.TransactionClient;

/* ------------------------------------------------------------------ Datos */

const PEOPLE = [
  'Daniel Ruiz',
  'Ana Torres',
  'Carlos Pérez',
  'Lucía Gómez',
  'Marta Rivas',
  'José Herrera',
  'Sofía Méndez',
  'Pablo Castro',
];

/** Culto general: bloque, minutos previstos y responsable sugerido. */
const CULTO_BLOCKS = [
  { name: 'Bienvenida', minutes: 10, person: 'Carlos Pérez' },
  { name: 'Alabanzas', minutes: 15, person: 'Ana Torres' },
  { name: 'Prédica', minutes: 40, person: 'Daniel Ruiz' },
  { name: 'Anuncios', minutes: 5, person: 'Lucía Gómez' },
];

const SERVICE_TYPES = [
  {
    name: 'Culto general',
    color: '#FFB547',
    schedule: { weekday: 1, hour: 10, minute: 0 },
    blocks: CULTO_BLOCKS,
  },
  { name: 'Jóvenes', color: '#F0508C', schedule: { weekday: 7, hour: 19, minute: 0 }, blocks: [] },
  { name: 'ABC', color: '#9B5CFF', schedule: { weekday: 1, hour: 9, minute: 0 }, blocks: [] },
];

/** Himnos de dominio publico (traducciones de Juan B. Cabrera y otros, siglo XIX). */
const SONGS: {
  title: string;
  author: string;
  sections: { label: string | null; text: string }[];
}[] = [
  {
    title: 'Sublime gracia',
    author: 'John Newton',
    sections: [
      {
        label: 'Estrofa 1',
        text: 'Sublime gracia del Señor\nque a un pecador salvó;\nfui ciego mas hoy veo yo,\nperdido y Él me halló.',
      },
      {
        label: 'Estrofa 2',
        text: 'Su gracia me enseñó a temer,\nmis dudas ahuyentó;\n¡oh cuán precioso fue a mi ser\ncuando Él me transformó!',
      },
      {
        label: 'Estrofa 3',
        text: 'En los peligros o aflicción\nque yo he tenido aquí,\nsu gracia siempre me libró\ny me guiará feliz.',
      },
      {
        label: 'Estrofa 4',
        text: 'Y cuando en Sion por siglos mil\nbrillando esté cual sol,\nyo cantaré por siempre allí\nsu amor que me salvó.',
      },
    ],
  },
  {
    title: 'Santo, santo, santo',
    author: 'Reginald Heber',
    sections: [
      {
        label: 'Estrofa 1',
        text: '¡Santo, santo, santo! Señor omnipotente,\nsiempre el labio mío loores te dará;\n¡Santo, santo, santo! te adoro reverente,\nDios en tres personas, bendita Trinidad.',
      },
      {
        label: 'Estrofa 2',
        text: '¡Santo, santo, santo! la inmensa muchedumbre\nde ángeles que cumplen tu santa voluntad,\nante ti se postra bañada de tu lumbre,\nante ti que has sido, que eres y serás.',
      },
    ],
  },
  {
    title: 'Castillo fuerte',
    author: 'Martín Lutero',
    sections: [
      {
        label: null,
        text: 'Castillo fuerte es nuestro Dios,\ndefensa y buen escudo;\ncon su poder nos librará\nen este trance agudo.',
      },
      {
        label: null,
        text: 'Con furia y con afán\nacósanos Satán;\npor armas deja ver\nastucia y gran poder;\ncual él no hay en la tierra.',
      },
    ],
  },
  {
    title: 'Oh, qué amigo nos es Cristo',
    author: 'Joseph M. Scriven',
    sections: [
      {
        label: 'Estrofa 1',
        text: '¡Oh, qué amigo nos es Cristo!\nÉl llevó nuestro dolor,\ny nos manda que llevemos\ntodo a Dios en oración.',
      },
    ],
  },
  {
    title: 'Roca de la eternidad',
    author: 'Augustus M. Toplady',
    sections: [
      {
        label: 'Estrofa 1',
        text: 'Roca de la eternidad,\nfuiste abierta tú por mí;\nsé mi escondedero fiel,\nsolo encuentro paz en ti.',
      },
    ],
  },
  {
    title: 'Cariñoso Salvador',
    author: 'Charles Wesley',
    sections: [
      {
        label: 'Estrofa 1',
        text: 'Cariñoso Salvador,\nhuyo de la tempestad\na tu seno protector,\nfiándome de tu bondad.',
      },
    ],
  },
];

/** Fondos de IRIS_SPEC §11, como PNG pequenos versionados en prisma/fixtures/. */
const BACKGROUNDS = [
  { title: 'Aurora', file: 'fondo-aurora.png' },
  { title: 'Alba', file: 'fondo-alba.png' },
];

/* -------------------------------------------------------------- Utilidades */

/** El mismo candado que usa el API: el seed tambien escribe tablas sincronizables. */
async function lockChurch(tx: Tx, churchId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`iris_sync:${churchId}`}, 0))`;
}

/** La cuenta de una iglesia: si no existe, crea la iglesia y la cuenta juntas. */
async function ensureAccount(
  churchName: string,
  email: string,
  fullName: string,
  passwordHash: string,
) {
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { church: true },
  });
  if (existing) return existing;

  console.log(`  + iglesia ${churchName} y cuenta ${email}`);
  const church = await prisma.church.create({
    data: { name: churchName, timezone: 'America/Lima' },
  });
  return prisma.user.create({
    data: { email, fullName, passwordHash, churchId: church.id },
    include: { church: true },
  });
}

/** Domingos anteriores a hoy, a las 10:00 de Lima (UTC-5, sin horario de verano). */
function lastSundays(count: number): Date[] {
  const now = new Date();
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const daysBack = lima.getUTCDay() === 0 ? 7 : lima.getUTCDay();
  const base = Date.UTC(
    lima.getUTCFullYear(),
    lima.getUTCMonth(),
    lima.getUTCDate() - daysBack,
    15,
  );
  return Array.from({ length: count }, (_, week) => new Date(base - week * 7 * 86_400_000));
}

/* ---------------------------------------------------------------- Contenido */

async function seedContent(churchId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockChurch(tx, churchId);

      const people = new Map<string, string>();
      for (const name of PEOPLE) {
        const key = nameKey(name);
        const found = await tx.person.findFirst({
          where: { churchId, nameKey: key, deletedAt: null },
        });
        const person =
          found ?? (await tx.person.create({ data: { churchId, name, nameKey: key } }));
        people.set(name, person.id);
      }

      let culto: { id: string; name: string } | null = null;
      for (const type of SERVICE_TYPES) {
        const key = nameKey(type.name);
        let row = await tx.serviceType.findFirst({
          where: { churchId, nameKey: key, deletedAt: null },
        });
        if (!row) {
          console.log(`  + servicio ${type.name}`);
          row = await tx.serviceType.create({
            data: {
              churchId,
              name: type.name,
              nameKey: key,
              color: type.color,
              scheduleWeekday: type.schedule.weekday,
              scheduleHour: type.schedule.hour,
              scheduleMinute: type.schedule.minute,
              blocks: {
                create: type.blocks.map((block, position) => ({
                  position,
                  name: block.name,
                  plannedMinutes: block.minutes,
                  defaultPersonId: people.get(block.person) ?? null,
                })),
              },
            },
          });
        }
        if (type.name === 'Culto general') culto = row;
      }

      for (const song of SONGS) {
        const titleKey = nameKey(song.title);
        const exists = await tx.song.count({ where: { churchId, titleKey, deletedAt: null } });
        if (exists) continue;
        console.log(`  + canción ${song.title}`);
        await tx.song.create({
          data: {
            churchId,
            title: song.title,
            titleKey,
            author: song.author,
            searchText: searchText(song.title, song.author, ...song.sections.map((s) => s.text)),
            sections: {
              create: song.sections.map((section, position) => ({ position, ...section })),
            },
          },
        });
      }

      if (culto && (await tx.serviceRecord.count({ where: { churchId } })) === 0) {
        await seedRecords(tx, churchId, culto, people);
      }
    },
    { timeout: 60_000 },
  );
}

/**
 * Los ultimos 10 domingos del Culto general. La semana pasada con los tiempos
 * de la maqueta; hace 5 semanas con Anuncios omitido; hace 6, con la Predica
 * ajustada. Responsables rotando entre las personas.
 */
async function seedRecords(
  tx: Tx,
  churchId: string,
  culto: { id: string; name: string },
  people: Map<string, string>,
): Promise<void> {
  const names = [...people.keys()];
  const lastWeek = [580, 1145, 3090, 355];

  for (const [week, date] of lastSundays(10).entries()) {
    await tx.serviceRecord.create({
      data: {
        id: randomUUID(),
        churchId,
        date,
        serviceTypeId: culto.id,
        serviceTypeName: culto.name,
        blocks: {
          create: CULTO_BLOCKS.map((block, position) => {
            const planned = block.minutes * 60;
            const isSkipped = week === 4 && block.name === 'Anuncios';
            const isAdjusted = week === 5 && block.name === 'Prédica';
            // Variacion determinista de -60 s a +6 min alrededor de lo previsto.
            const drift = ((week * 7 + position * 13) % 8) * 60 - 60;
            const actual = week === 0 ? lastWeek[position]! : Math.max(60, planned + drift);
            const personName =
              position === 2 ? 'Daniel Ruiz' : names[(week + position) % names.length]!;

            return {
              id: randomUUID(),
              position,
              name: block.name,
              plannedSeconds: planned,
              actualSeconds: isSkipped ? 0 : actual,
              personId: people.get(personName) ?? null,
              personName,
              status: isSkipped ? 'SKIPPED' : isAdjusted ? 'ADJUSTED' : 'COMPLETED',
            };
          }),
        },
      },
    });
  }
  console.log('  + 10 registros de tiempos del Culto general');
}

/* -------------------------------------------------------------- Multimedia */

async function seedBackgrounds(churchId: string, userId: string): Promise<void> {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.STORAGE_BUCKET || 'iris-media';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.warn('! Sin variables STORAGE_*: se saltan las imágenes de fondo.');
    return;
  }

  const s3 = new S3Client({
    endpoint,
    region: process.env.STORAGE_REGION || 'auto',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    console.warn(
      `! MinIO no responde en ${endpoint}: se saltan las imágenes de fondo. ` +
        'Levántalo con `docker compose -f docker-compose.dev.yml up -d` y vuelve a correr el seed.',
    );
    return;
  }

  for (const background of BACKGROUNDS) {
    const titleKey = nameKey(background.title);
    const exists = await prisma.mediaAsset.count({
      where: { churchId, titleKey, kind: 'IMAGE', deletedAt: null },
    });
    if (exists) continue;

    const body = readFileSync(join(FIXTURES, background.file));
    const id = randomUUID();
    const objectKey = objectKeyFor(churchId, id, background.file);

    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: body, ContentType: 'image/png' }),
    );

    await prisma.$transaction(async (tx) => {
      await lockChurch(tx, churchId);
      const upload = {
        id,
        churchId,
        kind: 'IMAGE' as const,
        fileName: background.file,
        contentType: 'image/png',
        sizeBytes: BigInt(body.length),
        objectKey,
      };
      await tx.mediaUpload.create({
        data: {
          ...upload,
          expiresAt: new Date(),
          confirmedAt: new Date(),
          createdByUserId: userId,
        },
      });
      await tx.mediaAsset.create({
        data: {
          ...upload,
          title: background.title,
          titleKey,
          width: 320,
          height: 180,
          isBackground: true,
        },
      });
    });
    console.log(`  + fondo ${background.title}`);
  }
}

/* -------------------------------------------------------------------- Main */

try {
  console.log('Seed de desarrollo:');
  const passwordHash = await hash(PASSWORD);

  const pastor = await ensureAccount(
    'Iglesia Vida Nueva',
    'pastor@vidanueva.org',
    'Daniel Ruiz',
    passwordHash,
  );
  const vidaNueva = pastor.church;

  // Una segunda iglesia con su propia cuenta, para probar que los datos no se mezclan.
  await ensureAccount(
    'Iglesia Monte Sion',
    'pastor@montesion.org',
    'Samuel Vega',
    passwordHash,
  );

  await seedContent(vidaNueva.id);
  await seedBackgrounds(vidaNueva.id, pastor.id);

  if ((await prisma.bibleTranslation.count()) === 0) {
    console.warn(
      '! La Biblia no está importada. Ver docs/bible-source.md: ' +
        'pnpm db:import-bible data/bible/spaRV1909_vpl.txt',
    );
  }

  console.log(
    `Listo. Cuentas: pastor@vidanueva.org (Vida Nueva) y pastor@montesion.org ` +
      `(Monte Sion). Contraseña: ${PASSWORD}`,
  );
} finally {
  await prisma.$disconnect();
}
