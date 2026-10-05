-- Version de sincronizacion global y creciente (docs/plans/00-fundamentos §5).
-- Cada fila sincronizable toma un numero nuevo de esta secuencia en cada
-- INSERT/UPDATE; /sync/changes entrega lo que tenga version > cursor.
CREATE SEQUENCE "iris"."sync_version_seq";

CREATE FUNCTION "iris"."bump_sync_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_version := nextval('iris.sync_version_seq');
  RETURN NEW;
END $$;

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "sync_version" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "churches_sync_version_idx" ON "churches"("sync_version");

CREATE TRIGGER "churches_bump_sync_version"
  BEFORE INSERT OR UPDATE ON "churches"
  FOR EACH ROW EXECUTE FUNCTION "iris"."bump_sync_version"();

-- Las iglesias que ya existian reciben su primera version.
UPDATE "churches" SET "sync_version" = 0;
