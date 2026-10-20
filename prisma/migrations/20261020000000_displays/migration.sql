-- Televisores vinculados a la iglesia con un codigo (contrato §18). La
-- vinculacion pendiente y el canal en vivo viven en memoria del API.

-- CreateTable
CREATE TABLE "displays" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "displays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "displays_token_hash_key" ON "displays"("token_hash");

-- CreateIndex
CREATE INDEX "displays_church_id_idx" ON "displays"("church_id");

-- AddForeignKey
ALTER TABLE "displays" ADD CONSTRAINT "displays_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
