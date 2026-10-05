-- Multimedia: tickets de subida y medios (fase 05).

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- CreateTable
CREATE TABLE "media_uploads" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "kind" "media_kind" NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "object_key" VARCHAR(400) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "kind" "media_kind" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "title_key" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "duration_seconds" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "is_background" BOOLEAN NOT NULL DEFAULT false,
    "object_key" VARCHAR(400) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "object_deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_uploads_church_id_expires_at_idx" ON "media_uploads"("church_id", "expires_at");

-- CreateIndex
CREATE INDEX "media_uploads_expires_at_idx" ON "media_uploads"("expires_at");

-- CreateIndex
CREATE INDEX "media_assets_church_id_kind_created_at_idx" ON "media_assets"("church_id", "kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_church_id_sync_version_idx" ON "media_assets"("church_id", "sync_version");

-- AddForeignKey
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "media_assets_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "media_assets"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
