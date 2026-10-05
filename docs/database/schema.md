# Modelo de datos · Iris

Base `iris`, esquema `iris`, rol `iris_app` en el contenedor compartido `atmosfera-postgres`.
La fuente de verdad es `prisma/schema.prisma`; este documento explica lo que el schema no dice solo.

Convenciones: tablas en `snake_case` plural, columnas en `snake_case`, ids UUID v7 en texto,
fechas `timestamptz(3)` en UTC.

## Diagrama

```mermaid
erDiagram
  churches ||--o{ church_members : "tiene"
  users ||--o{ church_members : "pertenece"
  users ||--o{ sessions : "abre"
  churches ||--o{ sessions : "entra a"
  users ||--o{ password_reset_codes : "pide"
  churches ||--o{ invitations : "invita"
  users ||--o{ invitations : "envía"
  churches |o--o{ users : "última usada"
  churches ||--o{ people : "tiene"
  churches ||--o{ service_types : "tiene"
  service_types ||--o{ block_templates : "bloques"
  people |o--o{ block_templates : "responsable sugerido"
  churches ||--o{ songs : "tiene"
  songs ||--o{ song_sections : "secciones"
  churches ||--o{ media_uploads : "reserva"
  churches ||--o{ media_assets : "tiene"
  bible_translations ||--o{ bible_books : "libros"
  bible_books ||--o{ bible_verses : "versículos"
  churches ||--o{ service_records : "tiene"
  service_types ||--o{ service_records : "de tipo"
  service_records ||--o{ block_records : "bloques"

  churches {
    text id PK
    varchar name
    varchar timezone
    bool bible_enabled
    bool multimedia_enabled
    bool time_control_enabled
    bigint storage_quota_bytes
    bigint sync_version
  }
  people {
    text id PK
    text church_id FK
    varchar name
    varchar name_key
    timestamptz deleted_at
    bigint sync_version
  }
  service_types {
    text id PK
    text church_id FK
    varchar name
    varchar name_key
    char color
    smallint schedule_weekday
    smallint schedule_hour
    smallint schedule_minute
    timestamptz deleted_at
    bigint sync_version
  }
  songs {
    text id PK
    text church_id FK
    varchar title
    varchar title_key
    varchar author
    varchar copyright
    text search_text
    timestamptz deleted_at
    bigint sync_version
  }
  song_sections {
    text id PK
    text song_id FK
    smallint position
    varchar label
    varchar text
  }
  media_uploads {
    text id PK
    text church_id FK
    media_kind kind
    varchar file_name
    varchar content_type
    bigint size_bytes
    varchar object_key
    timestamptz expires_at
    timestamptz confirmed_at
    text created_by_user_id FK
  }
  media_assets {
    text id PK
    text church_id FK
    media_kind kind
    varchar title
    varchar title_key
    varchar description
    bigint size_bytes
    int duration_seconds
    int width
    int height
    bool is_background
    varchar object_key
    timestamptz deleted_at
    timestamptz object_deleted_at
    bigint sync_version
  }
  service_records {
    text id PK
    text church_id FK
    timestamptz date
    text service_type_id FK
    varchar service_type_name
    text created_by_session_id FK
    timestamptz deleted_at
    bigint sync_version
  }
  block_records {
    text id PK
    text service_record_id FK
    smallint position
    varchar name
    int planned_seconds
    int actual_seconds
    text person_id
    varchar person_name
    block_status status
  }
  bible_translations {
    varchar code PK
    varchar name
    char language
    int version
    int size_bytes
  }
  bible_books {
    varchar translation_code PK
    varchar id PK
    varchar name
    testament testament
    smallint chapter_count
    smallint position
  }
  bible_verses {
    varchar translation_code PK
    varchar book_id PK
    smallint chapter PK
    smallint verse PK
    text text
  }
  block_templates {
    text id PK
    text service_type_id FK
    smallint position
    varchar name
    smallint planned_minutes
    text default_person_id FK
  }
  users {
    text id PK
    varchar email UK
    varchar password_hash
    varchar full_name
    bool is_active
    text last_church_id FK
  }
  church_members {
    text id PK
    text church_id FK
    text user_id FK
    member_role role
    bool is_active
  }
  sessions {
    text id PK
    text user_id FK
    text church_id FK
    client_platform platform
    int refresh_generation
    timestamptz expires_at
    timestamptz revoked_at
  }
  invitations {
    text id PK
    text church_id FK
    varchar email
    member_role role
    varchar token_hash UK
    text invited_by_user_id FK
    timestamptz expires_at
    timestamptz accepted_at
    timestamptz revoked_at
  }
  password_reset_codes {
    text id PK
    text user_id FK
    varchar code_hash
    int verification_attempts
    timestamptz used_at
  }
```

## Cuentas

| Tabla | Lo no obvio |
|---|---|
| `churches` | El tenant. Todo el contenido cuelga de aquí. `timezone` (IANA, por defecto `America/Lima`) define "hoy" y los horarios. Lleva `sync_version` porque el feed de las consolas informa cambios de nombre, zona y módulos |
| `users` | Global: un usuario entra a varias iglesias por su membresía. `email` siempre en minúsculas y recortado. `last_church_id` (`ON DELETE SET NULL`) es la iglesia a la que entra `sign-in` |
| `church_members` | Único `(church_id, user_id)`. Rol `OWNER` / `ADMIN` / `OPERATOR` (los permisos de cada uno están en `src/common/constants/permissions.ts`). Quitar a alguien pone `is_active = false`; aceptar otra invitación la reactiva |
| `sessions` | Una por dispositivo. El refresh token **no** se guarda: es `<id>.<generación>.<HMAC>` y la tabla solo guarda `refresh_generation`. `expires_at` se corre 60 días en cada refresh. `church_id` cambia con `switch-church`. `revoked_reason` incluye `MEMBER_REMOVED` |
| `invitations` | El token del enlace (32 bytes base64url) no se guarda: solo su SHA-256 en `token_hash`. Vence a los 7 días. Único **parcial** `(church_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL`: una sola pendiente por correo; reinvitar revoca la anterior |
| `password_reset_codes` | El código se guarda hasheado (argon2). Máximo 5 intentos y 3 envíos por día por usuario |

## Contenido de la iglesia (fase 03)

| Tabla | Lo no obvio |
|---|---|
| `churches` (módulos) | `bible_enabled`, `multimedia_enabled`, `time_control_enabled` (Letras siempre está activo, sin columna) y `storage_quota_bytes` (5 GiB por defecto) |
| `people` | Quien dirige un bloque; no es un usuario. `name_key` = `nameKey(name)` (contrato §2), único **parcial** por iglesia entre las no borradas. Borrar una persona deja en `null` los `default_person_id` de las plantillas y toca esos tipos de servicio para que suban de versión |
| `service_types` | Horario en hora local de la iglesia (`weekday` 1 = domingo). `CHECK`: los tres campos del horario son todos `null` o todos válidos. `color` es uno de los seis de la paleta. `name_key` único parcial |
| `block_templates` | Sin `sync_version` propia: cada escritura reemplaza la lista y actualiza el padre. Único `(service_type_id, position)` **diferible** (`DEFERRABLE INITIALLY DEFERRED`) para poder reordenar dentro de una transacción. `CHECK planned_minutes BETWEEN 1 AND 240`. `default_person_id` con `ON DELETE SET NULL` |

## Canciones (fase 04)

| Tabla | Lo no obvio |
|---|---|
| `songs` | `title_key` = `nameKey(title)`: **no** es único (dos versiones de una canción son válidas); solo la importación lo usa para saltar repetidas. `search_text` = `searchText(title, author, …secciones)`, recalculado por el servicio en cada escritura. Índice GIN `gin_trgm_ops` sobre `search_text` (extensión `pg_trgm` en el esquema `iris`) |
| `song_sections` | Una sección = una pantalla del TV. Se reemplazan completas en cada escritura (ids nuevos). Único `(song_id, position)` |

Búsqueda: `search_text ILIKE '%q%' OR word_similarity(q, search_text) > 0.6`, con `q` normalizada por `nameKey`;
primero las que coinciden en el título, luego por parecido.

## Multimedia (fase 05)

Los bytes viven en el almacenamiento S3 compatible (MinIO en local, R2 en producción); ni la base ni el API los tocan.
Clave del objeto: `churches/<churchId>/media/<id>/<nombre-saneado>`, nunca expuesta al cliente.

| Tabla | Lo no obvio |
|---|---|
| `media_uploads` | Ticket de subida: reserva cuota durante 1 h. Cuota = medios no borrados + subidas pendientes sin vencer + el archivo nuevo ≤ `storage_quota_bytes`, comprobada bajo el candado de la iglesia. La limpieza horaria borra los vencidos sin confirmar (y su objeto) |
| `media_assets` | Se crea al confirmar, **con el mismo id** que la subida. `is_background` solo puede ser `true` en imágenes. `duration_seconds` (audio y video) y `width`/`height` (imagen y video) los mide el cliente y se guardan enteros. El borrado suave libera la cuota al instante; 24 h después la limpieza borra el objeto y marca `object_deleted_at` |

## Tiempos (fase 07)

Solo tiempos: lo proyectado nunca se guarda.

| Tabla | Lo no obvio |
|---|---|
| `service_records` | El `id` lo genera la consola (el `PUT` es idempotente). `date` = inicio del primer bloque, UTC. `service_type_id` con FK `ON DELETE NO ACTION` (los tipos solo se borran en suave; `NO ACTION` y no `RESTRICT` para que borrar una iglesia en cascada no falle por el orden). `service_type_name` copia el nombre por si el tipo se borra. `created_by_session_id` (`SET NULL`) indica qué dispositivo lo guardó |
| `block_records` | `id` también de la consola. `person_id` **sin** FK a propósito: el registro conserva el id de una persona borrada, y `person_name` su nombre en ese momento. `status` `ADJUSTED` lo pone solo la API al corregir la duración. `CHECK` de segundos ≥ 0. `blockCount` de `/people` cuenta los no `SKIPPED` de registros no borrados |

## Biblia (fase 06)

Contenido **global**, sin `church_id`. Lo carga `pnpm db:import-bible` (fuente y licencia en `docs/bible-source.md`).

| Tabla | Lo no obvio |
|---|---|
| `bible_translations` | `version` sube con cada `--force`; las consolas vuelven a descargar cuando cambia (ETag `"<code>-<version>"`). `size_bytes` = tamaño de la descarga **comprimida** |
| `bible_books` | PK `(translation_code, id)`, `id` en USFM (`GEN`, `JHN`). `position` 1–66 en orden canónico |
| `bible_verses` | PK `(translation_code, book_id, chapter, verse)`. El texto puede estar vacío (versículos unidos al anterior) |

## Sincronización (fase 00)

Las consolas mantienen una copia local con `GET /sync/changes`. Para eso:

- **Secuencia global** `iris.sync_version_seq` y función `iris.bump_sync_version()`.
- Cada tabla sincronizable tiene `sync_version bigint` y un trigger
  `BEFORE INSERT OR UPDATE … EXECUTE FUNCTION iris.bump_sync_version()` que le asigna
  `nextval` en cada escritura. El código nunca escribe esa columna.
- Índice `(church_id, sync_version)` en cada tabla sincronizable (`churches`: solo `sync_version`).
- **Orden de confirmación**: toda escritura sobre tablas sincronizables corre en una transacción que primero
  toma `pg_advisory_xact_lock(hashtextextended('iris_sync:' || church_id, 0))`
  (`src/database/church-write-lock.ts`). Así, dentro de una iglesia, una versión menor siempre se confirma antes
  que una mayor y el cursor nunca se salta filas.
- Los hijos (secciones, bloques) no llevan versión: al cambiar, el repositorio toca el `updated_at` del padre y
  el trigger del padre sube su versión.

## Borrado suave

Las tablas de contenido llevan `deleted_at`. Las lecturas normales filtran `deleted_at IS NULL`; la
sincronización informa los borrados. Los únicos por *nameKey* son **parciales** (`WHERE deleted_at IS NULL`),
declarados en el schema con la preview `partialIndexes` de Prisma, para poder reutilizar el nombre de algo borrado.
