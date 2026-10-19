-- La consola guarda el registro de tiempos desde que empieza el primer bloque
-- y lo reenvia en cada cambio: si la app se cierra, se retoma (contrato §14).
-- Los registros que ya existen estan terminados.

-- AlterEnum
ALTER TYPE "block_status" ADD VALUE 'PENDING';
ALTER TYPE "block_status" ADD VALUE 'RUNNING';

-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN     "status" "record_status" NOT NULL DEFAULT 'FINISHED';

-- AlterTable
ALTER TABLE "block_records" ADD COLUMN     "ended_at" TIMESTAMPTZ(3),
ADD COLUMN     "started_at" TIMESTAMPTZ(3);
