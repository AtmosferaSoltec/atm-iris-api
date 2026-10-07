-- CreateEnum
CREATE TYPE "plan_item_kind" AS ENUM ('SONG', 'MEDIA');

-- CreateTable
CREATE TABLE "service_plan_items" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "kind" "plan_item_kind" NOT NULL,
    "ref_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_plan_items_church_id_position_idx" ON "service_plan_items"("church_id", "position");

-- CreateIndex
CREATE INDEX "service_plan_items_church_id_sync_version_idx" ON "service_plan_items"("church_id", "sync_version");

-- AddForeignKey
ALTER TABLE "service_plan_items" ADD CONSTRAINT "service_plan_items_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "service_plan_items_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "service_plan_items"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
