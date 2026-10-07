-- Una cuenta por iglesia: se van los roles, el equipo y las invitaciones.
-- Cada usuario pasa a pertenecer a una sola iglesia (`users.church_id`).

-- AlterTable: la iglesia de cada cuenta. Sale de su membresia activa: la ultima
-- iglesia usada si sigue activa, y si no, la activa mas antigua.
ALTER TABLE "users" ADD COLUMN "church_id" TEXT;

UPDATE "users" u
SET "church_id" = COALESCE(
  (
    SELECT m."church_id"
    FROM "church_members" m
    WHERE m."user_id" = u."id"
      AND m."church_id" = u."last_church_id"
      AND m."is_active"
  ),
  (
    SELECT m."church_id"
    FROM "church_members" m
    WHERE m."user_id" = u."id"
      AND m."is_active"
    ORDER BY m."created_at"
    LIMIT 1
  )
);

-- Una cuenta sin ninguna iglesia activa no podia iniciar sesion: se descarta.
DELETE FROM "users" WHERE "church_id" IS NULL;

-- Las sesiones abiertas en otra iglesia que no sea la de la cuenta ya no sirven.
DELETE FROM "sessions" s
USING "users" u
WHERE s."user_id" = u."id" AND s."church_id" <> u."church_id";

ALTER TABLE "users" ALTER COLUMN "church_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "users_church_id_idx" ON "users"("church_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fuera lo del equipo.
ALTER TABLE "users" DROP CONSTRAINT "users_last_church_id_fkey";
ALTER TABLE "users" DROP COLUMN "last_church_id";

DROP TABLE "invitations";
DROP TABLE "church_members";
DROP TYPE "member_role";

-- El motivo MEMBER_REMOVED ya no existe. Postgres no permite quitar un valor de
-- un enum: se recrea el tipo y las filas que lo usaban pasan a SIGN_OUT.
ALTER TYPE "session_revoked_reason" RENAME TO "session_revoked_reason_old";
CREATE TYPE "session_revoked_reason" AS ENUM ('SIGN_OUT', 'SIGN_OUT_ALL', 'PASSWORD_RESET', 'TOKEN_REUSE');
ALTER TABLE "sessions" ALTER COLUMN "revoked_reason" TYPE "session_revoked_reason"
  USING (
    CASE "revoked_reason"::text
      WHEN 'MEMBER_REMOVED' THEN 'SIGN_OUT'
      ELSE "revoked_reason"::text
    END
  )::"session_revoked_reason";
DROP TYPE "session_revoked_reason_old";
