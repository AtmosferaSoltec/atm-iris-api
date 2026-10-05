# 05 · Multimedia

## Objetivo

Contrato §11: imágenes, videos y música de cada iglesia en un almacenamiento S3 compatible, con
subidas y descargas por URL firmada, cuota por iglesia y fondos personalizados.

## Dependencias

Fases 00 y 03 (`storage.usedBytes` de `/church`).

## Almacenamiento

1. **MinIO en local**: `docker-compose.dev.yml` en la raíz del repo con un solo servicio `minio`
   (`minio/minio`, puertos `9000` y `9001`, volumen `iris_minio_data`) y un servicio de un solo uso
   `minio-setup` (`minio/mc`) que crea el bucket `iris-media` y lo deja **privado**.
   CORS para que el navegador suba directo: variable `MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:3000`.
   Documenta en el README cómo levantarlo. (No es Postgres: no choca con la regla de la casa.)
2. Dependencias: `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`.
3. Variables (en `env.schema.ts` y `.env.example`): `STORAGE_ENDPOINT` (`http://localhost:9000`),
   `STORAGE_REGION` (`auto`), `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET` (`iris-media`),
   `STORAGE_FORCE_PATH_STYLE` (`true` para MinIO) y `STORAGE_PUBLIC_ENDPOINT` (opcional): el host con el que se
   **firman** las URLs que reciben los clientes. Por defecto es `STORAGE_ENDPOINT`; al integrar la PC de Windows se pone
   la IP de la Mac (`http://192.168.x.x:9000`), porque `localhost` no le sirve. Usa un segundo `S3Client` solo para firmar
   con ese endpoint. Opcionales en desarrollo: sin ellas el API arranca y los
   endpoints de `/media/uploads` responden 503 con un mensaje claro. En producción, obligatorias.
4. Puerto `StoragePort` en `src/integrations/storage/` (clase abstracta, como `MailPort`):
   `createUploadUrl(key, contentType, sizeBytes, expiresIn)`, `createDownloadUrl(key, expiresIn, fileName)`,
   `headObject(key)` → `{ sizeBytes } | null`, `deleteObject(key)`, `ping()`.
   Implementación `S3StorageService`. La salud (`/health`) agrega `storage` con `ping()`.
5. Claves de objeto: `churches/<churchId>/media/<mediaId>/<nombre-saneado>`. Nunca se exponen al cliente.

## Modelo (migración `media`)

```text
media_uploads  id, church_id, kind, file_name VarChar(200), content_type VarChar(100), size_bytes BigInt,
               object_key VarChar(400), expires_at, confirmed_at?, created_by_user_id, created_at
media_assets   id, church_id, kind (enum media_kind: IMAGE/VIDEO/AUDIO), title VarChar(120),
               title_key, description VarChar(500)?, file_name, content_type, size_bytes BigInt,
               duration_seconds Int?, width Int?, height Int?, is_background Boolean default false,
               object_key, deleted_at?, object_deleted_at?, sync_version, created_at, updated_at
               índices: (church_id, kind, created_at desc), (church_id, sync_version)
```

Trigger de `sync_version` en `media_assets`. Actualiza `docs/database/schema.md`.

## Endpoints (`src/modules/media/`)

Tabla de tipos y máximos exacta del contrato §11 en `media.constants.ts`.

1. `POST /media/uploads`: valida `kind`/`contentType`/`sizeBytes`; cuota = usado (no borrados) + pendientes no
   vencidos + este archivo ≤ `storage_quota_bytes` (`STORAGE_QUOTA_EXCEEDED`). Crea `media_uploads` (vence en 1 h)
   y devuelve `UploadTicket` con `headers: { "Content-Type": contentType }`.
2. `POST /media`: busca la subida (de esta iglesia, sin confirmar, sin vencer); `headObject` debe existir y medir
   `size_bytes` (si no, `UPLOAD_NOT_FOUND`). Crea el `media_asset` con el **mismo id** que la subida.
   `isBackground` solo vale `true` para `image` (si no, ignóralo y guarda `false`).
3. `GET /media` (filtros `kind`, `isBackground`, `search` por `title_key`), `GET /:id`, `PATCH`, `DELETE` (suave).
4. `GET /media/:id/download-url`: GET firmado de 1 h con `ResponseContentDisposition` usando `file_name`.
5. **Limpieza**: tarea programada cada hora (`@nestjs/schedule`) que (a) borra del almacenamiento y de la tabla
   las subidas vencidas sin confirmar y (b) borra del almacenamiento los objetos de medios con `deleted_at`
   de más de 24 h, marcando `object_deleted_at`. Registra en el log cuántos borró.

## Criterios de aceptación

- Con MinIO arriba: pedir ticket → `curl -X PUT --upload-file` → confirmar → `download-url` descarga el mismo archivo.
- `image/gif` → `UNSUPPORTED_MEDIA_TYPE`; superar la cuota → `STORAGE_QUOTA_EXCEEDED`.
- `/church` refleja `storage.usedBytes`.
- Compila, lint, build.

## Desviaciones

_(Completar al cerrar la fase.)_
