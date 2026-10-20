-- Videos de YouTube en la biblioteca (Multimedia > YouTube) y en el plan del servicio.

-- AlterEnum
ALTER TYPE "plan_item_kind" ADD VALUE 'YOUTUBE';

-- CreateTable
CREATE TABLE "youtube_videos" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "video_id" CHAR(11) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "author" VARCHAR(200) NOT NULL DEFAULT '',
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "youtube_videos_church_id_sync_version_idx" ON "youtube_videos"("church_id", "sync_version");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_videos_church_id_video_id_key" ON "youtube_videos"("church_id", "video_id") WHERE deleted_at IS NULL;

-- AddForeignKey
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "youtube_videos_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "youtube_videos"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
