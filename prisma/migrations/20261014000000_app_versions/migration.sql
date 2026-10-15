-- Version publicada de cada app (una fila por plataforma). Las apps preguntan al abrir (GET /app-version)
-- y, si son anteriores, muestran un aviso que obliga a actualizar. Se cambia a mano cuando la version
-- nueva YA se puede descargar (si no, se bloquea a las iglesias sin salida):
--   UPDATE iris.app_versions SET version = '1.0.1', updated_at = now() WHERE platform = 'windows';
--   UPDATE iris.app_versions SET version = '1.0.1', download_url = 'https://testflight.apple.com/join/XXXX' WHERE platform = 'ios';
CREATE TABLE "app_versions" (
    "platform" VARCHAR(20) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "download_url" VARCHAR(300),
    "notes" VARCHAR(300),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("platform")
);

INSERT INTO "app_versions" ("platform", "version") VALUES
  ('ios', '1.0.0'),
  ('windows', '1.0.0');
