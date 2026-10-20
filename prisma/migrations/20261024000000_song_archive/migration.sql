-- Canciones archivadas: la ultima vez que se usaron y cuando se archivaron.

-- AlterTable
ALTER TABLE "songs" ADD COLUMN "last_used_at" TIMESTAMPTZ(3),
ADD COLUMN "archived_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "songs_church_id_archived_at_idx" ON "songs"("church_id", "archived_at");
