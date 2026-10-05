# 06 · Biblia

## Objetivo

Contrato §13: servir la **Reina-Valera 1909** completa (dominio público) para que las consolas la
descarguen y la usen sin conexión.

## Dependencias

Fase 00. Independiente del resto.

## Fuente del texto

- Usa la edición de dominio público de **eBible.org**, identificador `spaRV1909`
  (página: https://ebible.org/find/details.php?id=spaRV1909). Descarga el formato VPL o USFX
  (por ejemplo `https://ebible.org/Scriptures/spaRV1909_vpl.zip`).
- **Verifica** en la página que la licencia diga dominio público antes de usarlo, y deja la URL y la
  fecha de descarga en `docs/bible-source.md`.
- **No uses la Reina-Valera 1960** ni ninguna otra traducción con derechos, aunque la encuentres más fácil.
- Si la descarga no está disponible o el formato no es el esperado, **detente y pregunta** al usuario.

## Modelo (migración `bible`)

```text
bible_translations  code VarChar(20) PK, name VarChar(80), language Char(2), version Int, size_bytes Int
bible_books         translation_code + id (USFM, VarChar(3)) PK compuesta, name VarChar(40),
                    testament (enum OLD/NEW), chapter_count SmallInt, position SmallInt
bible_verses        translation_code, book_id, chapter SmallInt, verse SmallInt, text Text
                    PK (translation_code, book_id, chapter, verse)
```

Sin `church_id`: es contenido global. Actualiza `docs/database/schema.md`.

## Importación

- `scripts/import-bible.ts` (se corre con `tsx`): lee el archivo descargado (ruta por argumento), arma los 66 libros
  con sus **nombres en español** (tabla propia en el script: Génesis, Éxodo, Levítico, …, Apocalipsis; "Salmos",
  "Cantares", "1 Samuel"…), testamento y posición canónica, y carga los versículos en lotes con `createMany`.
- Idempotente: si la traducción existe con la misma `version`, no hace nada; con `--force` reemplaza todo y sube
  `version`. Calcula `size_bytes` del JSON de descarga.
- Script en `package.json`: `"db:import-bible": "tsx scripts/import-bible.ts"`. El archivo descargado **no** se versiona
  (agrega la ruta a `.gitignore`); documenta en el README cómo obtenerlo.
- Comprobación al terminar: 66 libros, 1189 capítulos, ~31 100 versículos. Imprime los conteos.

## Endpoints (`src/modules/bible/`)

- `GET /bible/translations`, `GET /bible/translations/:code/books`,
  `GET /bible/translations/:code/books/:bookId/chapters/:chapter` (404 si el capítulo no existe).
- `GET /bible/translations/:code/download`: arma `BibleDownload` (`chapters[c][v]`), lo **cachea en memoria** por
  `code + version`, responde comprimido con gzip (`Content-Encoding: gzip`) y `ETag: "<code>-<version>"`;
  si llega `If-None-Match` igual, 304.
- Todos requieren sesión; ninguno requiere permisos especiales.

## Criterios de aceptación

- `Juan 3:16` devuelve "Porque de tal manera amó Dios al mundo…" (texto 1909).
- La descarga completa pesa del orden de 1–2 MB comprimida y responde 304 con el ETag.
- Compila, lint, build.

## Desviaciones

_(Completar al cerrar la fase.)_
