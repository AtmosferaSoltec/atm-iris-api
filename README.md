# Iris · API

Backend de Iris: cuentas, iglesias y contenido para la **web** (`atm-iris-web`) y las consolas de **iPad** y **Windows**.

NestJS 12 (ESM) · Prisma 7 + PostgreSQL 18 · Zod 4 · argon2 · Resend. Sigue `../forma-de-trabajo.md`; las desviaciones están anotadas en cada plan.

- Dominio y reglas: [`docs/BACKEND_SPEC.md`](docs/BACKEND_SPEC.md)
- Roadmap y planes por etapa: [`docs/plans/`](docs/plans/README.md) · Contrato: [`docs/contract/api-v1.md`](docs/contract/api-v1.md)
- Convenciones y glosario: [`docs/conventions.md`](docs/conventions.md)

## Arranque local

La base vive en el stack compartido `../atmosfera-postgres` (rol `iris_app`, base `iris`, esquema `iris`, más `iris_shadow` para Prisma). Este repo no levanta Postgres.

```bash
(cd ../atmosfera-postgres && docker compose up -d)
cp .env.example .env          # completa DATABASE_URL con IRIS_APP_PASSWORD y genera los secretos
pnpm install
pnpm db:generate              # cliente de Prisma en src/generated/
pnpm db:migrate               # aplica migraciones
pnpm db:seed:dev              # pastor@vidanueva.org / vidanueva123
pnpm start:dev                # http://localhost:3020/api/v1 · Swagger en /api/v1/docs
```

Sin `RESEND_API_KEY` ni `MAIL_FROM`, los correos se escriben en el log: el código de recuperación aparece en la consola del API.

## Scripts

| Script | Qué hace |
|---|---|
| `start:dev` | API con recarga |
| `build` | Compila las plantillas de correo y el API |
| `lint` · `test` · `test:e2e` | oxlint · unitarias · e2e contra la base real (usan correos `@e2e.iris.test` y los borran al final) |
| `db:migrate` · `db:deploy` | Crear y aplicar migraciones (local) · solo aplicar (producción) |
| `db:seed:dev` | Iglesia y pastor de ejemplo. Idempotente; no corre en producción |
| `mail:build` | Compila `src/integrations/mail/templates/*.mjml` a `.generated.ts` (se versionan) |

## Autenticación

Detalle en [`docs/plans/01-login/README.md`](docs/plans/01-login/README.md).

- **Access token** JWT de 15 min en `Authorization: Bearer`.
- **Refresh token** con rotación y 60 días de inactividad; una sesión por dispositivo.
- **Recuperación** en 3 pasos con código de 6 dígitos por correo.

| Método | Ruta `/api/v1/auth/…` | Auth |
|---|---|---|
| POST | `sign-up` · `sign-in` · `refresh` | Pública |
| POST | `forgot-password` · `verify-reset-code` · `reset-password` | Pública |
| GET | `me` | Bearer |
| POST | `sign-out` · `sign-out-all` | Bearer |

Las respuestas van en `{ data }`; los errores, en `{ statusCode, code, message, errors? }`, con `code` estable en inglés y `message` en español.

**Para las consolas (iPad / Windows):** guarda el refresh token en el Keychain o el Credential Locker y manda `client: { platform: "ios" | "windows", deviceName }` al iniciar sesión. Ante un 401 en cualquier llamada, llama a `refresh` una vez y reintenta. Si `refresh` responde 401, vuelve a la pantalla de acceso.

## Variables

Ver [`.env.example`](.env.example). En producción son obligatorias `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_SECRET`, `RESEND_API_KEY` y `MAIL_FROM`: sin ellas el API no arranca.
