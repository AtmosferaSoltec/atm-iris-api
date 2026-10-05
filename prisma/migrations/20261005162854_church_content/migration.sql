-- Contenido de la iglesia: modulos, cuota, personas y tipos de servicio (fase 03).

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "bible_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "multimedia_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "storage_quota_bytes" BIGINT NOT NULL DEFAULT 5368709120,
ADD COLUMN     "time_control_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(80) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "name_key" VARCHAR(60) NOT NULL,
    "color" CHAR(7) NOT NULL,
    "schedule_weekday" SMALLINT,
    "schedule_hour" SMALLINT,
    "schedule_minute" SMALLINT,
    "deleted_at" TIMESTAMPTZ(3),
    "sync_version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_templates" (
    "id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "planned_minutes" SMALLINT NOT NULL,
    "default_person_id" TEXT,

    CONSTRAINT "block_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_church_id_sync_version_idx" ON "people"("church_id", "sync_version");

-- CreateIndex
CREATE UNIQUE INDEX "people_church_id_name_key_key" ON "people"("church_id", "name_key") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "service_types_church_id_sync_version_idx" ON "service_types"("church_id", "sync_version");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_church_id_name_key_key" ON "service_types"("church_id", "name_key") WHERE (deleted_at IS NULL);

-- Posicion unica dentro del tipo, DIFERIBLE: al reordenar los bloques en una
-- transaccion, dos filas pueden intercambiar posiciones; la unicidad se
-- comprueba al confirmar y no fila por fila.
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_service_type_id_position_key"
  UNIQUE ("service_type_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_default_person_id_fkey" FOREIGN KEY ("default_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- El horario es completo o no existe.
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_schedule_check" CHECK (
  ("schedule_weekday" IS NULL AND "schedule_hour" IS NULL AND "schedule_minute" IS NULL)
  OR ("schedule_weekday" BETWEEN 1 AND 7 AND "schedule_hour" BETWEEN 0 AND 23 AND "schedule_minute" BETWEEN 0 AND 59)
);

ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_planned_minutes_check"
  CHECK ("planned_minutes" BETWEEN 1 AND 240);

-- Version de sincronizacion (ver migracion sync_versioning).
CREATE TRIGGER "people_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "people"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();

CREATE TRIGGER "service_types_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "service_types"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();
