-- Interruptores de Iris entero (por encima de los modulos de cada iglesia). Se cambian a mano:
--   UPDATE iris.system_features SET enabled = true WHERE key = 'bible';
CREATE TABLE "system_features" (
    "key" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_features_pkey" PRIMARY KEY ("key")
);

-- La Biblia queda apagada mientras se resuelve su licencia: ninguna iglesia la ve.
INSERT INTO "system_features" ("key", "enabled", "description") VALUES
  ('bible', false, 'Biblia en las consolas. Apagada hasta tener una versión con licencia.');

-- Al cambiar un interruptor, toda iglesia sube de version de sincronizacion para que las
-- consolas vuelvan a leer sus modulos sin esperar a otro cambio.
CREATE FUNCTION "iris"."touch_churches_on_feature_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "iris"."churches" SET "updated_at" = CURRENT_TIMESTAMP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

CREATE TRIGGER "system_features_touch_churches"
  BEFORE INSERT OR UPDATE OR DELETE ON "system_features"
  FOR EACH ROW EXECUTE FUNCTION "iris"."touch_churches_on_feature_change"();
