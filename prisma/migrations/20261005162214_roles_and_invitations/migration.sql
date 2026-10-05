-- Roles owner / admin / operator (contrato §3). El antiguo MEMBER pasa a
-- OPERATOR renombrando el valor: asi las filas existentes se convierten solas.
ALTER TYPE "member_role" RENAME VALUE 'MEMBER' TO 'OPERATOR';
ALTER TYPE "member_role" ADD VALUE 'ADMIN' BEFORE 'OPERATOR';

-- AlterEnum
ALTER TYPE "session_revoked_reason" ADD VALUE 'MEMBER_REMOVED';

-- AlterTable
ALTER TABLE "church_members" ALTER COLUMN "role" SET DEFAULT 'OPERATOR';

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Lima';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_church_id" TEXT;

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "member_role" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_church_id_idx" ON "invitations"("church_id");

-- Una sola invitacion pendiente por correo e iglesia (parcial).
CREATE UNIQUE INDEX "invitations_church_id_email_key" ON "invitations"("church_id", "email") WHERE (accepted_at IS NULL AND revoked_at IS NULL);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_last_church_id_fkey" FOREIGN KEY ("last_church_id") REFERENCES "churches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
