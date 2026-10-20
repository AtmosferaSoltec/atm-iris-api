-- La letra proyectada usa fuentes web (iguales en todo aparato) y suma
-- negrita, cursiva y mayusculas (contrato §6). Las claves de antes (fuentes de
-- Apple) pasan a la mas parecida de las nuevas.

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "projection_font_bold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projection_font_italic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projection_uppercase" BOOLEAN NOT NULL DEFAULT false;

UPDATE "churches" SET "projection_font_family" = CASE "projection_font_family"
  WHEN 'serif' THEN 'lora'
  WHEN 'georgia' THEN 'merriweather'
  WHEN 'baskerville' THEN 'playfairDisplay'
  WHEN 'palatino' THEN 'lora'
  WHEN 'avenirNext' THEN 'montserrat'
  WHEN 'futura' THEN 'poppins'
  WHEN 'gillSans' THEN 'inter'
  WHEN 'optima' THEN 'inter'
  WHEN 'systemRounded' THEN 'poppins'
  ELSE "projection_font_family"
END
WHERE "projection_font_family" NOT IN ('system', 'inter', 'montserrat', 'poppins', 'oswald', 'bebasNeue', 'playfairDisplay', 'lora', 'merriweather');
