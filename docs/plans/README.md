# Planes de implementación · atm-iris-api

> **Para el agente de la API.** Este es tu punto de partida. Trabajas en la **Mac**, solo en este
> repo, las fases en orden y sin detenerte entre ellas (reglas completas en
> [`00-fundamentos/plataforma.md`](00-fundamentos/plataforma.md) §4).

## Lee antes de empezar

1. [`00-fundamentos/plataforma.md`](00-fundamentos/plataforma.md): producto, arquitectura y reglas de trabajo (idéntico en los 4 repos).
2. [`../contract/api-v1.md`](../contract/api-v1.md): **el contrato que implementas**. Los otros tres agentes ya están programando contra él.
3. [`../BACKEND_SPEC.md`](../BACKEND_SPEC.md): dominio y reglas de negocio. Si contradice al contrato, **manda el contrato**.
4. `../../../forma-de-trabajo.md` (carpeta `Atmosfera/`): stack y convenciones de la casa. Las desviaciones aceptadas están en [`01-login/README.md`](01-login/README.md).
5. [`../conventions.md`](../conventions.md): glosario.
6. El código actual: el auth (fase 01) ya está hecho y es la referencia de estilo (capas, comentarios, errores).

## Comandos

| Para | Comando |
|---|---|
| Postgres compartido | `cd ../atmosfera-postgres && docker compose up -d` |
| Arrancar | `pnpm start:dev` (puerto 3020) |
| Verificar en cada fase | `pnpm lint && npx tsc --noEmit -p tsconfig.json && pnpm build` |
| Migración nueva | `pnpm db:migrate --name <snake_case_descriptivo>` |
| Cliente Prisma | `pnpm db:generate` |
| Correos | `pnpm mail:build` tras tocar un `.mjml` |
| Pruebas (solo en la fase 09) | `pnpm test` · `pnpm test:e2e` |

## Fases

Marca cada casilla al terminar la fase y completa su sección *Desviaciones*.

| # | Fase | Estado |
|---|---|---|
| 00 | [Fundamentos transversales](00-fundamentos/README.md): permisos, versión de sincronización, borrado suave, paginación, request id | [ ] |
| 01 | [Login y sesiones](01-login/README.md) | [x] ya hecha |
| 02 | [Cuenta y equipo](02-cuenta-y-equipo/README.md): roles, cambio de iglesia, perfil, contraseña, dispositivos, invitaciones | [ ] |
| 03 | [Iglesia](03-iglesia/README.md): ajustes, módulos, personas, tipos de servicio | [ ] |
| 04 | [Canciones](04-canciones/README.md): CRUD, búsqueda, importación | [ ] |
| 05 | [Multimedia](05-multimedia/README.md): almacenamiento S3/MinIO, subidas firmadas, cuota | [ ] |
| 06 | [Biblia](06-biblia/README.md): importar RVR1909, consulta y descarga completa | [ ] |
| 07 | [Tiempos](07-tiempos/README.md): registros de servicio | [ ] |
| 08 | [Sincronización](08-sincronizacion/README.md): feed `/sync/changes` para las consolas | [ ] |
| 09 | [Calidad y entrega](09-calidad-y-entrega/README.md): pruebas, documentación, datos de ejemplo, reporte | [ ] |
| 99 | [Revisión final](99-revision-final/README.md) — **no es tuya**: la hace el agente revisor cuando los 4 repos terminen | — |

## Reglas propias de este repo

- Sigue `forma-de-trabajo.md`: **controller → service → repository**; el repositorio es el único que toca Prisma y recibe `churchId` como **primer parámetro**; Zod por endpoint con `ZodValidationPipe`; errores con `code` de `common/constants/error-codes.ts`; comentarios en español explicando el porqué.
- Cada fase que cambia el modelo: migración con nombre descriptivo y actualización de `docs/database/schema.md` (lo crea la fase 00).
- Cada endpoint nuevo lleva `@ApiTags`, `@ApiOperation` y, si es privado, `@ApiBearerAuth()`. Swagger en `/api/v1/docs`.
- Las respuestas siguen el contrato **al pie de la letra**: nombres, `null` explícitos, enums en minúsculas, fechas ISO. Haz un *mapper* por recurso (`<modulo>.mapper.ts`) que convierta las filas de Prisma al tipo del contrato; nunca devuelvas una fila de Prisma directamente.
- Variables nuevas → `.env.example` en el mismo cambio, comentadas.
- No toques `atmosfera-postgres` salvo lo que diga una fase.
