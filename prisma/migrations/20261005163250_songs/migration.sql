-- Biblioteca de canciones (fase 04).

-- Trigramas para la busqueda. pg_trgm es "trusted": la crea iris_app sin superusuario.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA "iris";

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "title_key" VARCHAR(120) NOT NULL,
    "author" VARCHAR(120) NOT NULL DEFAULT '',
    "copyright" VARCHAR(200),
    "search_text" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_sections" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "label" VARCHAR(40),
    "text" VARCHAR(2000) NOT NULL,

    CONSTRAINT "song_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "songs_church_id_title_key_idx" ON "songs"("church_id", "title_key");

-- CreateIndex
CREATE INDEX "songs_church_id_sync_version_idx" ON "songs"("church_id", "sync_version");

-- CreateIndex
CREATE INDEX "songs_search_text_trgm_idx" ON "songs" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "song_sections_song_id_position_key" ON "song_sections"("song_id", "position");

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_sections" ADD CONSTRAINT "song_sections_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "songs_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "songs"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
