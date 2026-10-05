# 08 · Sincronización para las consolas

## Objetivo

Contrato §12: un feed incremental `GET /sync/changes` con el que el iPad y Windows mantienen su copia
local de la iglesia y trabajan sin conexión.

## Dependencias

Fases 00 (versión y bloqueo por iglesia), 03, 04, 05, 07: el feed entrega personas, tipos de servicio,
canciones, medios, registros y la propia iglesia.

## Diseño

- Cursor = la `sync_version` más alta entregada, como texto. `since` se valida como entero ≥ 0 en texto
  (`VALIDATION_FAILED` si no).
- Una sola consulta de "candidatos" que una las tablas sincronizables de la iglesia:
  ```sql
  SELECT 'person' AS type, id, sync_version, deleted_at IS NOT NULL AS deleted FROM iris.people
    WHERE church_id = $1 AND sync_version > $2
  UNION ALL SELECT 'serviceType', … FROM iris.service_types …
  UNION ALL SELECT 'song', … FROM iris.songs …
  UNION ALL SELECT 'media', … FROM iris.media_assets …
  UNION ALL SELECT 'serviceRecord', … FROM iris.service_records …
  ORDER BY sync_version LIMIT $3 + 1
  ```
  (`LIMIT + 1` para saber `hasMore`). Luego se cargan completos, por tipo, solo los no borrados, con los
  mismos *mappers* de cada módulo, y se arman `changes` y `deleted`.
- `church`: se incluye si `churches.sync_version > since` (no cuenta para `limit`).
- `cursor`: la versión del último candidato entregado; si no hubo candidatos, el mismo `since`
  (o la versión de la iglesia si es mayor).
- **Horizonte seguro**: gracias a `withChurchLock` (fase 00), dentro de una iglesia las versiones se confirman en
  orden. Revisa que **todas** las escrituras de las fases 03–07 lo usen; si alguna no, corrígela aquí.
- `limit` 1–500, por defecto 200.

## Implementación

- `src/modules/sync/` con controller, service y repository. Reutiliza los repositorios/mappers de cada módulo
  (expórtalos de sus módulos) en lugar de duplicar consultas.
- Respuesta sin paginar: `{ data: SyncPage }`.
- Índices `(church_id, sync_version)` ya existen; verifica con `EXPLAIN` que la consulta los usa.

## Criterios de aceptación

- `since=0` con la iglesia de ejemplo devuelve todo en una o varias páginas, y el último `hasMore` es `false`.
- Crear y luego borrar una persona después del cursor: aparece solo en `deleted.people`.
- Renombrar una persona: aparece en `changes.people` con el nombre nuevo y el cursor avanza.
- Cambiar los módulos: viene `church`.
- Compila, lint, build.

## Desviaciones

_(Completar al cerrar la fase.)_
