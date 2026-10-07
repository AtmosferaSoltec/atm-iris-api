# 04 · Canciones

## Objetivo

Contrato §10: biblioteca de letras de cada iglesia con búsqueda sin acentos y paginación. Las letras se escriben una a una; no hay importación en lote ni campo de derechos de autor.

## Dependencias

Fase 00 (`nameKey`, `searchText`, versión de sincronización, borrado suave, paginación) y 03 (patrón de módulo).

## Modelo (migración `songs`)

```text
songs          id, church_id, title VarChar(120), title_key VarChar(120), author VarChar(120) default '',
               search_text Text, deleted_at?, sync_version, created_at, updated_at
               índices: (church_id, title_key), (church_id, sync_version),
               GIN trigram sobre search_text (extensión pg_trgm en el esquema iris; es "trusted",
               la crea iris_app con CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA iris)
song_sections  id, song_id (cascade), position SmallInt, label VarChar(40)?, text VarChar(2000)
               único (song_id, position)
```

`search_text` = `searchText(title, author, ...sections.text)`; lo recalcula el servicio en cada escritura.
Trigger de `sync_version` en `songs`. Actualiza `docs/database/schema.md`.

## Endpoints (`src/modules/songs/`)

- `GET /songs?search&page&limit&sort`:
  - Sin `search`: orden por `title_key` (o `-updatedAt` con `sort=-updatedAt`).
  - Con `search` (se normaliza con `nameKey`): filtra con `search_text ILIKE '%' || q || '%'` **o**
    `similarity(search_text, q) > 0.2`, ordena por `similarity` descendente y luego título. Raw SQL con
    `Prisma.sql` parametrizado (nunca concatenar).
  - Devuelve `SongSummary` (`sectionCount`, `firstLine` = primera línea de la primera sección).
- `GET /songs/:id` → `Song` con secciones ordenadas.
- `POST` (con `id?`), `PUT /:id` (crea si no existe), `DELETE` (suave). Las secciones se reemplazan completas.

## Criterios de aceptación

- Buscar "sublime" encuentra "Sublime gracia"; "senor" encuentra "Señor" dentro de la letra.
- Compila, lint, build.

## Desviaciones

| Qué | Motivo |
|---|---|
| Búsqueda por parecido con `word_similarity(q, search_text) > 0.6` en lugar de `similarity(search_text, q) > 0.2` | `similarity` compara la consulta con la letra completa y da puntajes casi nulos: "castilo" no encontraba "Castillo fuerte". `word_similarity` la compara con el tramo más parecido |
| Orden con búsqueda: primero las que coinciden en el título (`title_key ILIKE`), luego por parecido y por título | "Ordena por relevancia" del contrato: quien busca "sublime" espera "Sublime gracia" antes que una letra que diga "sublime" |
| Con `search`, el parámetro `sort` se ignora | El contrato pide relevancia cuando hay búsqueda |
| `author` ausente se toma como `""`; `label` vacío se guardan como `null`; textos recortados en los extremos | Interpretación conservadora de "`""` si no hay" (§10) y de los `null` explícitos |
| La extensión `pg_trgm` y el índice GIN se declaran así: la extensión en el SQL de la migración (`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA iris`), el índice en el schema (`@@index(..., type: Gin)`) | Sin la preview `postgresqlExtensions`, Prisma ignora las extensiones; el índice declarado en el schema evita deriva |
| `POST /songs` con `id` existente en la iglesia → 200 tal cual; `PUT` crea (201) o reemplaza (200); `PUT` sobre una borrada → 404 | Mismas reglas que la fase 03 |
| Verificado con `curl`: "sublime", "senor" (dentro de la letra), "castilo" (tipeo), paginación y `meta` | — |

- **Importación y copyright (retirados el 2026-10-07)**: se quitaron `POST /songs/import` y la columna `copyright` (migración `20261007000000_songs_drop_copyright`). El límite de 2 MB del cuerpo JSON se conserva por seguridad.
