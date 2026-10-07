# 03 · Iglesia: ajustes, módulos, personas y tipos de servicio

## Objetivo

Contrato §6 (`/church`), §8 (`/people`) y §9 (`/service-types`). Es lo que hoy la web y las consolas
resuelven con mocks (`IRIS_SPEC.md` §6.6–6.8 y §11).

## Dependencias

Fase 00 (permisos, `nameKey`, versión de sincronización, borrado suave, `withChurchLock`) y 02 (roles, `timezone`).

## Modelo (migración `church_content`)

```text
churches        + bible_enabled, multimedia_enabled, time_control_enabled (bool, default true)
                + storage_quota_bytes BigInt default 5368709120
                (timezone y sync_version ya existen)
people          id, church_id, name VarChar(80), name_key VarChar(80), deleted_at?, sync_version,
                created_at, updated_at
                único parcial (church_id, name_key) WHERE deleted_at IS NULL
service_types   id, church_id, name VarChar(60), name_key, color Char(7),
                schedule_weekday SmallInt?, schedule_hour SmallInt?, schedule_minute SmallInt?,
                deleted_at?, sync_version, created_at, updated_at
                único parcial (church_id, name_key) WHERE deleted_at IS NULL
                CHECK: los tres campos de horario son todos null o todos no null
block_templates id, service_type_id (cascade), position SmallInt, name VarChar(60),
                planned_minutes SmallInt (CHECK 1–240)
                único (service_type_id, position) DEFERRABLE
```

Triggers de `sync_version` en `people` y `service_types`. Actualiza `docs/database/schema.md`.

## Endpoints

Módulos `src/modules/church/`, `src/modules/people/`, `src/modules/service-types/`.

### `/church`
- `GET`: `Church` del contrato, con `storage.usedBytes` = suma de `size_bytes` de los medios no borrados
  (la tabla llega en la fase 05: hasta entonces devuelve `0` desde un método del repositorio que la fase 05 completa).
- `PATCH { name?, timezone? }`: valida la zona con `Intl.supportedValuesOf('timeZone')`.
- `PUT /church/modules`: reemplaza los tres booleanos.

### `/people`
- `GET`: no borradas, por `name` (collation de la base es `C`: ordena en memoria con `Intl.Collator('es')`).
  `blockCount` = bloques de registros no borrados con ese `person_id` y estado distinto de `skipped`
  (la tabla llega en la fase 07: hasta entonces `0`, dejando la consulta lista para completarse).
- `POST { id?, name }`: idempotente por `id` (contrato §2). `PERSON_NAME_TAKEN` por `nameKey`.
- `PATCH { name }`, `DELETE`: el borrado pone `deleted_at`, no toca las plantillas
  y **toca** (`updated_at`) esos tipos de servicio para que suban de versión. Todo dentro de `withChurchLock`.

### `/service-types`
- `GET` (por `name`) y `GET /:id`. Respuesta con `blocks` ordenados por `position` y `schedule` armado o `null`.
- `POST` (con `id?`) y `PUT /:id` (crea si no existe): reemplazo completo de los bloques en una transacción:
  conserva los `id` que vienen, crea los nuevos, borra los que faltan, reescribe `position` según el orden.
  `SERVICE_TYPE_NAME_TAKEN` por `nameKey`.
- `DELETE`: borrado suave.

### Iglesia nueva

- `sign-up` (y la aceptación de invitación cuando crea iglesia, que hoy no ocurre) deja los módulos en `true` y
  la cuota por defecto. No siembra personas ni tipos de servicio: la iglesia empieza vacía.

## Criterios de aceptación

- Respuestas idénticas en forma al contrato (revisa `null` explícitos y enums).
- Crear dos personas "José Pérez" y " jose  perez " → la segunda da `PERSON_NAME_TAKEN`; tras borrar la primera,
  la segunda se puede crear.
- Borrar una persona que es responsable sugerida de un bloque deja ese bloque sin responsable.
- Compila, lint, build.

## Desviaciones

| Qué | Motivo |
|---|---|
| `PUT /service-types/:id` responde **201** cuando crea y **200** cuando reemplaza | El contrato no fija el código del `PUT`; se sigue la misma regla que `POST` (201) y que `PUT /service-records` (201/200). Todos son 2xx |
| `POST /people` y `POST /service-types` con un `id` que ya existe en la iglesia devuelven 200 con el recurso **tal cual**, aunque esté borrado | Es un reintento de la cola de la consola: la creación original ya ocurrió. La consola se entera del borrado por la sincronización |
| `PUT /service-types/:id` sobre un tipo **borrado** → 404 | Contrato §1.2: lo borrado responde 404. Revivirlo desharía un borrado hecho por otra persona |
| Un bloque con un `id` que pertenece a otro tipo de servicio → `409 ID_CONFLICT` con `errors["blocks.N.id"]`; ids de bloque repetidos en el mismo cuerpo → 400 | El contrato solo dice que los bloques con `id` lo conservan; esto evita "robar" bloques de otro tipo |
| `PATCH /church` sin `name` ni `timezone` → 400 | No hay nada que cambiar |
| La zona horaria se valida con `Intl.supportedValuesOf('timeZone')` más `UTC` | Algunas versiones de ICU no listan `UTC` aunque la acepten |
| Los nombres se guardan recortados pero sin colapsar espacios internos (`" jose  perez "` → `"jose  perez"`); la unicidad compara por `nameKey` | El contrato solo define `nameKey` para comparar; el nombre visible se respeta |
| `storage.usedBytes` devuelve 0 y `blockCount` 0 hasta que existan sus tablas (fases 05 y 07), desde métodos del repositorio que esas fases completan | Lo indica el plan |
| Verificado con `curl` (25 comprobaciones): forma de `Church`, zona inválida, módulos, `PERSON_NAME_TAKEN` y reuso del nombre tras borrar, idempotencia e `ID_CONFLICT`, 404 entre iglesias, reemplazo de bloques (ids conservados, reorden), borrar responsable sugerido limpia el bloque y sube la versión | — |

- **Responsable por bloque (retirado el 2026-10-07)**: las plantillas ya no llevan `defaultPersonId` (migración `20261007010000_block_templates_drop_default_person`): el responsable rota cada semana y se registra en cada servicio.
