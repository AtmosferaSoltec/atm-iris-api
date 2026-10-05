# 00 · Fundamentos transversales

## Objetivo

Dejar listas las piezas que usan todas las fases siguientes, para que cada módulo de negocio
solo tenga que aplicarlas: permisos por endpoint, contexto del tenant, versión de
sincronización, borrado suave, paginación, `nameKey`, request id y la documentación del modelo.

## Punto de partida

Ya existe (fase 01): `config/`, `common/` (filtros, interceptor `{ data }`, `ZodValidationPipe`,
`@Public`, `@CurrentUser`, `JwtAuthGuard`), `database/`, `integrations/mail/`, `modules/auth`,
`modules/health`. Úsalos; no los reescribas.

## Pasos

### 1. Permisos

1. `src/common/constants/permissions.ts`: el catálogo exacto del contrato §3 como `as const`:
   `church.manage`, `modules.manage`, `members.manage`, `songs.manage`, `media.manage`,
   `serviceTypes.manage`, `people.manage`, `records.write`, `records.manage`. Tipo `Permission`.
2. `ROLE_PERMISSIONS: Record<ChurchRole, readonly Permission[]>` en el mismo archivo, con la tabla del contrato.
   **Desviación aceptada de la casa**: los permisos viven en código, no en tablas sembradas. Iris tiene tres roles fijos y ninguna pantalla para crear roles; cuando la haya, se pasan a tablas.
3. `@RequirePermissions(...permissions)` en `common/decorators/` y `PermissionsGuard` en `common/guards/`.
   Va **después** de `JwtAuthGuard` en `app.module.ts`. Resuelve el rol desde el `AuthenticatedUser`
   y responde `403 FORBIDDEN` ("No tienes permiso para hacer esto.") si falta alguno.
4. `AuthenticatedUser.role` pasa a `owner | admin | operator` (la migración la hace la fase 02; aquí
   deja el tipo y el mapa listos y que compile con los valores actuales).

### 2. Request id

- Middleware en `common/middleware/request-id.middleware.ts`: toma `X-Request-Id` si viene (≤ 100 caracteres,
  `[A-Za-z0-9-_]`), si no genera un UUID; lo pone en la respuesta y en el logger de pino (`genReqId` de `pinoHttp`).

### 3. Paginación

- `common/dto/pagination.schema.ts`: `paginationSchema` (`page` ≥ 1 por defecto 1, `limit` 1–100 por defecto 20,
  `z.coerce.number()`), y helper `paginate(data, total, page, limit)` que devuelve `{ data, meta }`.
  El `ResponseTransformInterceptor` ya deja pasar lo que trae `data` + `meta`.
- Permite un máximo distinto por endpoint (`createPaginationSchema({ maxLimit: 500 })`) para tiempos y sync.

### 4. `nameKey`

- `src/shared/utils/text.ts`: `nameKey(value)` = trim → colapsar espacios internos → NFD sin marcas
  combinantes (`\p{M}`) → `toLocaleLowerCase('es')`. Exactamente la regla del contrato §2.
- `searchText(...parts)` = `nameKey` de las partes unidas por espacio (para búsquedas).
- Se guarda en columnas `name_key` / `search_text` calculadas por el servicio; **no** se usa la
  extensión `unaccent` (así la regla es una sola en TS y los clientes la replican igual).

### 5. Versión de sincronización

La base de `/sync/changes` (fase 08). Se monta ahora para que cada tabla nueva nazca con ella.

1. Migración `sync_versioning` con SQL a mano (Prisma la deja en `migration.sql`):
   ```sql
   CREATE SEQUENCE iris.sync_version_seq;
   CREATE FUNCTION iris.bump_sync_version() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN
     NEW.sync_version := nextval('iris.sync_version_seq');
     RETURN NEW;
   END $$;
   ```
2. Convención para **toda tabla sincronizable** (personas, tipos de servicio, canciones, medios,
   registros y la propia `churches`):
   - columna `syncVersion BigInt @default(0) @map("sync_version")`, índice `@@index([churchId, syncVersion])`
     (en `churches`: índice por `sync_version`);
   - trigger `BEFORE INSERT OR UPDATE ... EXECUTE FUNCTION iris.bump_sync_version()` creado en la
     misma migración que la tabla.
   - Aplica ya la columna y el trigger a `churches`.
3. **Orden de confirmación**: las secuencias no garantizan que una versión menor se confirme antes
   que una mayor. Para que el feed nunca se salte filas, toda escritura sobre tablas sincronizables
   va en una transacción que **primero** toma `SELECT pg_advisory_xact_lock(hashtextextended('iris_sync:' || $churchId, 0))`.
   Así, dentro de una iglesia, las escrituras se serializan y el orden de versión es el de confirmación.
   Implementa el helper `ChurchWriteLock` / `withChurchLock(churchId, tx => …)` en `src/database/`
   y úsalo en todos los repositorios de escritura desde la fase 03.
4. Los hijos (secciones de canción, bloques de plantilla, bloques de registro) **no** llevan versión:
   cuando cambian, el repositorio actualiza el padre (`updatedAt`), y eso dispara el trigger del padre.

### 6. Borrado suave

- Convención: `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(3)` en las tablas de contenido.
- Los repositorios filtran `deletedAt: null` en todas las lecturas salvo las de sync.
- Los índices únicos por *nameKey* deben ser **parciales** (`WHERE deleted_at IS NULL`): Prisma no los
  expresa, así que van como SQL en la migración y se documentan en el schema con `///`.

### 7. Escuchar en la red local

- `main.ts`: `app.listen(port, '0.0.0.0')` para que la PC de Windows llegue por la IP de la Mac al integrar.

### 8. Documentación del modelo

- Crea `docs/database/schema.md` con el modelo actual (churches, users, church_members, sessions,
  password_reset_codes) en un diagrama mermaid `erDiagram` y una tabla por modelo explicando lo no obvio.
  Cada fase siguiente lo amplía.

## Criterios de aceptación

- Compila, lint limpio, `pnpm build` pasa.
- Un endpoint de prueba temporal con `@RequirePermissions('members.manage')` devuelve 403 a un rol sin
  ese permiso (verificación rápida con `curl`; luego borra el endpoint).
- La respuesta trae `X-Request-Id`.
- La migración `sync_versioning` aplica en limpio (`pnpm db:migrate`).

## Desviaciones

| Qué | Motivo |
|---|---|
| Los únicos parciales por *nameKey* se declaran en `schema.prisma` con la preview `partialIndexes` (`@@unique([...], where: raw("deleted_at IS NULL"))`) en lugar de SQL a mano | Prisma 7.10 los soporta; escritos solo en SQL, `migrate dev` los ve como deriva y genera un `DROP INDEX` en la migración siguiente |
| `ChurchWriteLock` es un proveedor de `DatabaseModule` (`lock.run(churchId, tx => …)`), además de la función `withChurchLock(prisma, churchId, …)` y `lockChurch(tx, churchId)` | Los repositorios lo inyectan como cualquier dependencia y se puede doblar en pruebas |
| `resolveRequestId` lo usan el middleware y `genReqId` de pino, y el CORS expone `X-Request-Id` | Garantiza el mismo id en el header y en el log sin depender del orden de los middlewares; la web puede leer el header |
| `ChurchRole` ya es `owner \| admin \| operator`; hasta la migración de la fase 02 el `MEMBER` de la base se lee como `operator` | Así compila y el guard de permisos se pudo probar con un rol sin `members.manage` |
| Verificación del 403: endpoint temporal con `@RequirePermissions('members.manage')`, cuenta con rol rebajado por SQL → 403 `FORBIDDEN`; con `owner` → 200. Endpoint borrado | — |
