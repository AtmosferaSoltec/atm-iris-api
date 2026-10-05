# 07 · Tiempos

## Objetivo

Contrato §14: guardar los registros de tiempos que mandan las consolas al terminar un servicio, y
permitir consultarlos, ajustarlos y borrarlos.

## Dependencias

Fases 00, 03 (personas, tipos de servicio).

## Modelo (migración `service_records`)

```text
service_records  id (lo genera la consola), church_id, date Timestamptz, service_type_id (FK, sin cascade),
                 service_type_name VarChar(60), created_by_session_id?, deleted_at?, sync_version,
                 created_at, updated_at
                 índices: (church_id, date desc), (church_id, sync_version)
block_records    id, service_record_id (cascade), position SmallInt, name VarChar(60),
                 planned_seconds Int, actual_seconds Int, person_id Uuid? (sin FK), person_name VarChar(80)?,
                 status (enum block_status: COMPLETED/SKIPPED/ADJUSTED)
```

`person_id` **sin** clave foránea a propósito: el registro conserva el id de una persona borrada (spec §7.10).
Trigger de `sync_version` en `service_records`. Actualiza `docs/database/schema.md`.

## Endpoints (`src/modules/service-records/`)

- `GET /service-records?from&to&serviceTypeId&page&limit` (limit ≤ 500), más reciente primero; `GET /:id`.
- `PUT /:id` con `ServiceRecordInput`:
  - No existe → crea (requiere `records.write`), 201.
  - Existe en la iglesia y el contenido es **igual** (reintento de la cola de la consola) → 200 sin cambios.
  - Existe con contenido distinto → requiere `records.manage`, reemplaza, 200.
  - Existe en otra iglesia → `409 ID_CONFLICT`.
  - Valida `serviceTypeId` contra la iglesia (aunque esté borrado suave, se acepta: la consola pudo terminar el
    servicio sin conexión justo cuando alguien lo borró).
- `PATCH /:id/blocks/:blockId { actualSeconds?, personId? }`: `actualSeconds` → estado `adjusted`;
  `personId` → actualiza `person_name` con el nombre actual de la persona (o `null`). Toca el padre.
- `DELETE /:id`: suave.
- Completa ahora el `blockCount` de `GET /people` (fase 03) con la consulta real.

## Criterios de aceptación

- Mandar dos veces el mismo `PUT` deja un solo registro y la segunda respuesta es 200.
- Un `operator` puede crear pero no ajustar (403).
- `GET /people` muestra `blockCount` correcto, sin contar omitidos ni registros borrados.
- Compila, lint, build.

## Desviaciones

| Qué | Motivo |
|---|---|
| FK de `service_records.service_type_id` con `ON DELETE NO ACTION` (migración aparte `service_records_type_fk_no_action`) | Con `RESTRICT`, borrar una iglesia (cascada sobre tipos y registros) fallaría según el orden; `NO ACTION` se comprueba al final de la sentencia. Los tipos nunca se borran de verdad |
| `created_by_session_id` es FK a `sessions` con `ON DELETE SET NULL` | El plan no fija la FK; así no queda un id colgando si se borra el usuario |
| `PUT` sobre un registro **borrado** de la iglesia → 404 | Contrato §1.2. La consola puede descartar ese envío de su cola |
| "Contenido igual" compara fecha, tipo, nombre del tipo y todos los campos de cada bloque en orden. Un bloque ya `adjusted` no es igual al `completed` que reenvía la consola: reemplazarlo pide `records.manage` | Un reintento no debe deshacer un ajuste hecho desde la web |
| Ids de bloque que ya pertenecen a otro registro → `409 ID_CONFLICT` con `errors["blocks.N.id"]`; ids repetidos en el cuerpo → 400; el `:id` del `PUT` debe ser UUID | Mismas reglas que los bloques de plantilla |
| `PATCH …/blocks/:blockId { personId }` con una persona inexistente o borrada → 400 `errors.personId` | "Nombre actual" solo existe para una persona viva |
| `serviceTypeId` de otra iglesia → 400 `errors.serviceTypeId` (los borrados de la propia iglesia se aceptan) | Lo pide el plan |
| Verificado (19 comprobaciones): operator crea (201) y reintenta (200, un solo registro); operator no reemplaza distinto, no ajusta ni borra (403); ajuste → `adjusted`; cambio y borrado de responsable; `ID_CONFLICT`; tipo borrado aceptado; `from`/`to`; `limit` 500; `blockCount` sin omitidos ni borrados | — |
