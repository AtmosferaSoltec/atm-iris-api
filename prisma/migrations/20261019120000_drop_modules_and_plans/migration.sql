-- Iris se simplifica: todas las iglesias tienen canciones, multimedia y control
-- de tiempo, sin modulos que encender o apagar, y todas tienen el mismo espacio
-- (5 GiB, una constante del API, contrato §6) sin planes. La Biblia sale de las
-- consolas por ahora; sus tablas quedan para volver a activarla.

-- Interruptores de Iris entero: ya no hay modulos que apagar.
DROP TRIGGER IF EXISTS "system_features_touch_churches" ON "system_features";
DROP FUNCTION IF EXISTS "iris"."touch_churches_on_feature_change"();
DROP TABLE "system_features";

-- AlterTable
ALTER TABLE "churches" DROP COLUMN "bible_enabled",
DROP COLUMN "multimedia_enabled",
DROP COLUMN "storage_quota_bytes",
DROP COLUMN "time_control_enabled";
