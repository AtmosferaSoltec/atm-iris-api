# Iris · API

Backend de Iris: cuentas, iglesias, contenido, archivos, Biblia, tiempos y sincronización para la **web**
(`atm-iris-web`) y las consolas de **iPad** (`atm-iris-ios`) y **Windows** (`atm-iris-win`).

NestJS 12 (ESM) · Prisma 7 + PostgreSQL 18 · Zod 4 · argon2 · Resend · S3 compatible (MinIO / R2). Sigue
`../forma-de-trabajo.md`; las desviaciones están anotadas en cada plan.

- **Contrato** que consumen los clientes: [`docs/contract/api-v1.md`](docs/contract/api-v1.md)
- Planes por fase y sus desviaciones: [`docs/plans/`](docs/plans/README.md)
- Modelo de datos: [`docs/database/schema.md`](docs/database/schema.md)
- Dominio y reglas: [`docs/BACKEND_SPEC.md`](docs/BACKEND_SPEC.md) · Glosario: [`docs/conventions.md`](docs/conventions.md)
- Fuente de la Biblia: [`docs/bible-source.md`](docs/bible-source.md)

## Arranque local

La base vive en el stack compartido `../atmosfera-postgres` (rol `iris_app`, base `iris`, esquema `iris`, más
`iris_shadow` para Prisma). Este repo no levanta Postgres. MinIO sí: está en `docker-compose.dev.yml`.

```bash
(cd ../atmosfera-postgres && docker compose up -d)          # PostgreSQL 18 en :5432
docker compose -f docker-compose.dev.yml up -d              # MinIO: API S3 :9000 · consola :9001
cp .env.example .env          # completa DATABASE_URL con IRIS_APP_PASSWORD y genera los dos secretos
pnpm install
pnpm db:generate              # cliente de Prisma en src/generated/
pnpm db:migrate               # aplica las migraciones

# Biblia (una vez; el archivo no se versiona)
mkdir -p data/bible && (cd data/bible && curl -LO https://ebible.org/Scriptures/spaRV1909_vpl.zip && unzip -o spaRV1909_vpl.zip)
pnpm db:import-bible data/bible/spaRV1909_vpl.txt

pnpm db:seed:dev              # datos de ejemplo (abajo)
pnpm start:dev                # http://localhost:3020/api/v1 · Swagger en /api/v1/docs
```

El API escucha en todas las interfaces: la PC de Windows llega por `http://<IP-de-la-Mac>:3020/api/v1`.

### Datos de ejemplo

`pnpm db:seed:dev` es idempotente (crea solo lo que falta) y no corre en producción. Contraseña de todas las
cuentas: `vidanueva123` (o `DEV_SEED_PASSWORD`).

| Cuenta | Rol |
|---|---|
| `pastor@vidanueva.org` | `owner` de Iglesia Vida Nueva y `admin` de Iglesia Monte Sion (para probar el cambio de iglesia) |
| `admin@vidanueva.org` | `admin` de Vida Nueva |
| `operador@vidanueva.org` | `operator` de Vida Nueva |
| `pastor@montesion.org` | `owner` de Monte Sion |

Vida Nueva trae 8 personas, 3 tipos de servicio (Culto general con 4 bloques y responsables, Jóvenes, ABC), 6 himnos
de dominio público, 10 registros de tiempos de los últimos domingos (uno con un bloque omitido y otro ajustado) y, si
MinIO responde, 2 imágenes de fondo (`prisma/fixtures/`). Si la Biblia no está importada, el seed lo avisa.

### Almacenamiento (MinIO)

`docker-compose.dev.yml` levanta MinIO (`bitnamilegacy/minio`, porque MinIO ya no publica imágenes gratuitas) y un
servicio de un solo uso que crea el bucket **privado** `iris-media`. Consola en http://localhost:9001
(`iris-dev` / `iris-dev-secret`). Las variables `STORAGE_*` de `.env.example` ya apuntan a él.

- Sin variables `STORAGE_*`, en desarrollo el API arranca igual y las subidas responden `503 STORAGE_UNAVAILABLE`;
  en producción son obligatorias.
- Para que la PC de Windows suba y descargue archivos, pon `STORAGE_PUBLIC_ENDPOINT=http://<IP-de-la-Mac>:9000`:
  es el host con el que se firman las URLs.

### Correo

Sin `RESEND_API_KEY` ni `MAIL_FROM`, los correos (código de recuperación, contraseña cambiada, invitaciones) se
escriben en el log del API. En producción son obligatorias.

## Scripts

| Script | Qué hace |
|---|---|
| `start:dev` | API con recarga |
| `build` | Compila las plantillas de correo y el API |
| `lint` · `test` · `test:e2e` | oxlint · unitarias · e2e contra la base real (correos `@e2e.iris.test`, se borran al final; multimedia y Biblia se saltan si falta MinIO o la importación) |
| `db:migrate` · `db:deploy` | Crear y aplicar migraciones (local) · solo aplicar (producción) |
| `db:seed:dev` | Datos de ejemplo. Idempotente; no corre en producción |
| `db:import-bible <archivo> [--force]` | Importa la RVR1909. Sin `--force` no toca una ya importada; con `--force` la reemplaza y sube la versión |
| `mail:build` | Compila `src/integrations/mail/templates/*.mjml` a `.generated.ts` (se versionan) |

Verificación completa: `pnpm lint && npx tsc --noEmit -p tsconfig.json && pnpm test && pnpm test:e2e && pnpm build`.

## Endpoints

Todo cuelga de `/api/v1` y es privado (`Authorization: Bearer`) salvo lo marcado como público. El detalle exacto
(cuerpos, respuestas, códigos de error) está en el [contrato](docs/contract/api-v1.md) y en Swagger.

| Módulo | Rutas | Permiso para escribir |
|---|---|---|
| Auth | `POST /auth/sign-up` · `sign-in` · `refresh` · `forgot-password` · `verify-reset-code` · `reset-password` (públicas) · `GET/PATCH /auth/me` · `POST /auth/sign-out` · `sign-out-all` · `change-password` · `switch-church` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` | Sesión |
| Equipo | `GET /members` · `PATCH/DELETE /members/:id` · `GET/POST /invitations` · `POST /invitations/:id/resend` · `DELETE /invitations/:id` · `GET /invitations/lookup` y `POST /invitations/accept` (públicas) | `members.manage` |
| Iglesia | `GET/PATCH /church` · `PUT /church/modules` | `church.manage` · `modules.manage` |
| Personas | `GET/POST /people` · `PATCH/DELETE /people/:id` | `people.manage` |
| Tipos de servicio | `GET/POST /service-types` · `GET/PUT/DELETE /service-types/:id` | `serviceTypes.manage` |
| Canciones | `GET/POST /songs` · `POST /songs/import` · `GET/PUT/DELETE /songs/:id` | `songs.manage` |
| Multimedia | `POST /media/uploads` · `GET/POST /media` · `GET/PATCH/DELETE /media/:id` · `GET /media/:id/download-url` | `media.manage` |
| Biblia | `GET /bible/translations` · `…/:code/books` · `…/:code/books/:bookId/chapters/:chapter` · `…/:code/download` (gzip, ETag) | — |
| Tiempos | `GET /service-records` · `GET/PUT/DELETE /service-records/:id` · `PATCH /service-records/:id/blocks/:blockId` | `records.write` (crear) · `records.manage` |
| Sincronización | `GET /sync/changes?since=&limit=` (consolas) | — |
| Salud | `GET /health` (pública) | — |

Respuestas en `{ data }` (o `{ data, meta }` si están paginadas); errores en
`{ statusCode, code, message, errors?, timestamp, path }`, con `code` estable en inglés y `message` en español. Cada
respuesta lleva `X-Request-Id` (se respeta el del cliente).

**Para las consolas (iPad / Windows):** guarda el refresh token en el Keychain o el Credential Locker y manda
`client: { platform: "ios" | "windows", deviceName }` al iniciar sesión. Ante un 401, llama a `refresh` una vez y
reintenta; si `refresh` responde 401, vuelve a la pantalla de acceso. Mantén la copia local con `GET /sync/changes`
(`since=0` la primera vez, repetir mientras `hasMore`) y reenvía la cola de escrituras con los ids propios
(`POST /people`, `PUT /service-types/:id`, `PUT /service-records/:id` son idempotentes).

## Variables

Ver [`.env.example`](.env.example), comentado por secciones. En producción son obligatorias `JWT_ACCESS_SECRET`,
`REFRESH_TOKEN_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` y las `STORAGE_*`: sin ellas el API no arranca.
