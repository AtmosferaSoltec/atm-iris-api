-- El tamaño de la letra proyectada pasa de 40–200 a 100–250 (por defecto 100).
-- Las iglesias con un tamaño menor suben al nuevo mínimo.
ALTER TABLE "churches" ALTER COLUMN "projection_font_size_pt" SET DEFAULT 100;
UPDATE "churches" SET "projection_font_size_pt" = 100 WHERE "projection_font_size_pt" < 100;
