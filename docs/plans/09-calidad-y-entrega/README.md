# 09 · Calidad y entrega

## Objetivo

Cerrar la API: pruebas de lo importante, datos de ejemplo completos para que los clientes se integren,
documentación al día y el reporte final para el usuario.

## 1. Datos de ejemplo (`prisma/seed-dev.ts`)

Amplía el seed (sigue siendo idempotente y se niega a correr en producción) para que la iglesia de
desarrollo tenga lo mismo que las maquetas (`IRIS_SPEC.md` §11):

- Iglesia Vida Nueva, `America/Lima`, módulos encendidos. Usuarios: `pastor@vidanueva.org` (owner),
  `admin@vidanueva.org` (admin), `operador@vidanueva.org` (operator); contraseña `vidanueva123`.
- Una segunda iglesia "Iglesia Monte Sion" donde `pastor@vidanueva.org` es `admin` (para probar el cambio de iglesia).
- 8 personas, 3 tipos de servicio (Culto general con 4 bloques y responsables, Jóvenes, ABC).
- Las canciones de dominio público de la maqueta (Sublime gracia, Santo santo santo, Castillo fuerte,
  Oh qué amigo nos es Cristo, Roca de la eternidad, Cariñoso Salvador) con sus estrofas.
- 10 registros de tiempos de los últimos domingos (uno con un bloque omitido, otro ajustado).
- Si MinIO está arriba: 2 imágenes de fondo marcadas como fondo, a partir de PNG pequeños de degradado
  versionados en `prisma/fixtures/` (no agregues dependencias para generarlos). Si MinIO no está, sáltalo con un aviso.
- Si la Biblia no está importada, avisa cómo hacerlo (no la importa sola).

## 2. Pruebas

Unitarias (`*.spec.ts`, repositorio doblado) — al menos:
- `PermissionsGuard` y `ROLE_PERMISSIONS` contra la tabla del contrato.
- `nameKey` / `searchText`.
- Reglas de equipo: `LAST_OWNER`, admin tocando a owner, invitación duplicada.
- Reemplazo de bloques de tipos de servicio (ids conservados, posiciones).
- Idempotencia de `PUT /service-records` (igual / distinto / otra iglesia).
- Validación de subidas (tipo, tamaño, cuota).
- Armado de `SyncPage` (cursor, `hasMore`, borrados).

E2E (`test/*.e2e-spec.ts`, base real, correos `@e2e.iris.test`, limpieza al final) — al menos:
- Equipo: invitar → lookup → aceptar con cuenta nueva y existente → switch-church → quitar miembro corta el acceso.
- Personas y tipos de servicio: CRUD, duplicados, borrar persona responsable.
- Canciones: crear, buscar sin acentos, importar con duplicados.
- Multimedia (si MinIO está arriba; si no, `describe.skip` con motivo): ticket → PUT → confirmar → download-url.
- Biblia (si está importada): capítulo y descarga con 304.
- Tiempos: PUT idempotente, PATCH ajusta, permisos de operator.
- Sync: copia completa desde 0, cambios incrementales, borrados, cambio de módulos.
- Las pruebas de la fase 01 siguen pasando.

`pnpm lint && pnpm test && pnpm test:e2e && pnpm build` en verde.

## 3. Documentación

- `README.md`: arranque completo (Postgres, MinIO, migraciones, seed, Biblia), variables, endpoints por módulo.
- `docs/database/schema.md`: modelo final con diagrama mermaid.
- `docs/BACKEND_SPEC.md`: alinear con lo construido (roles, multimedia, Biblia, sync). Si hay diferencias con el
  contrato, documéntalas en el reporte; **no** edites `docs/contract/api-v1.md` salvo para corregir errores obvios
  de redacción, y dilo en el reporte.
- Swagger completo: cada endpoint con resumen, y los esquemas de respuesta principales.
- `.env.example` completo y comentado.

## 4. Revisión propia del contrato

Recorre `docs/contract/api-v1.md` sección por sección con la API corriendo y comprueba con `curl` cada endpoint:
forma de la respuesta, `null` explícitos, enums en minúsculas, códigos de error. Anota cualquier diferencia como
desviación.

## 5. Reporte

Entrega el reporte de `00-fundamentos/plataforma.md` §6 y pregunta al usuario si puede dar el repo por terminado.

## Desviaciones

_(Completar al cerrar la fase.)_
