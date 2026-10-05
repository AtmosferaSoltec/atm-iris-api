-- Registros de tiempos (fase 07).

-- CreateEnum
CREATE TYPE "block_status" AS ENUM ('COMPLETED', 'SKIPPED', 'ADJUSTED');

-- CreateTable
CREATE TABLE "service_records" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "service_type_name" VARCHAR(60) NOT NULL,
    "created_by_session_id" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_records" (
    "id" TEXT NOT NULL,
    "service_record_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "planned_seconds" INTEGER NOT NULL,
    "actual_seconds" INTEGER NOT NULL,
    "person_id" TEXT,
    "person_name" VARCHAR(80),
    "status" "block_status" NOT NULL,

    CONSTRAINT "block_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_records_church_id_date_idx" ON "service_records"("church_id", "date" DESC);

-- CreateIndex
CREATE INDEX "service_records_church_id_sync_version_idx" ON "service_records"("church_id", "sync_version");

-- CreateIndex
CREATE INDEX "block_records_person_id_idx" ON "block_records"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_records_service_record_id_position_key" ON "block_records"("service_record_id", "position");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_created_by_session_id_fkey" FOREIGN KEY ("created_by_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_records" ADD CONSTRAINT "block_records_service_record_id_fkey" FOREIGN KEY ("service_record_id") REFERENCES "service_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "block_records" ADD CONSTRAINT "block_records_seconds_check"
  CHECK ("planned_seconds" >= 0 AND "actual_seconds" >= 0);

-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "service_records_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "service_records"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
