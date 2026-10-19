-- Letras y Musica pasan a ser una sola cosa: la cancion, con letra, pista o
-- ambas (contrato §10). La pista sigue siendo un `MediaAsset` de audio (cuota,
-- subida firmada, cache de las consolas); la cancion la referencia uno a uno.

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "audio_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "songs_audio_id_key" ON "songs"("audio_id");

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cada pista de la antigua seccion Musica se vuelve una cancion solo con
-- pista. La descripcion de la pista (artista, album) pasa a ser el autor.
-- `title_key` ya es el `nameKey` del titulo; `search_text` suma el autor con
-- una aproximacion de `nameKey` en SQL (se recalcula exacto al editarla).
INSERT INTO "songs" ("id", "church_id", "title", "title_key", "author", "search_text", "audio_id", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  m."church_id",
  m."title",
  m."title_key",
  left(regexp_replace(btrim(coalesce(m."description", '')), '\s+', ' ', 'g'), 120),
  btrim(m."title_key" || ' ' || translate(
    lower(regexp_replace(btrim(left(coalesce(m."description", ''), 120)), '\s+', ' ', 'g')),
    'áéíóúüñàèìòùâêîôûäëïö',
    'aeiouunaeiouaeiouaeio'
  )),
  m."id",
  m."created_at",
  CURRENT_TIMESTAMP
FROM "media_assets" m
WHERE m."kind" = 'AUDIO' AND m."deleted_at" IS NULL;

-- Lo que el plan tenia como pista suelta ahora es la cancion que la contiene.
UPDATE "service_plan_items" p
SET "kind" = 'SONG', "ref_id" = s."id", "updated_at" = CURRENT_TIMESTAMP
FROM "songs" s
WHERE p."kind" = 'MEDIA' AND p."ref_id" = s."audio_id" AND p."deleted_at" IS NULL;
