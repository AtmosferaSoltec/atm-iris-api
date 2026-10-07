-- Como se ve la letra proyectada (contrato §6): tipografia, tamano (en puntos,
-- referidos a una pantalla de 1920 de ancho) y el fondo de cuando no hay
-- ninguno elegido. El id de fondo no tiene FK a proposito: si ya no existe
-- (una imagen borrada, por ejemplo), los clientes caen a negro solos.
ALTER TABLE "churches" ADD COLUMN "projection_font_family" VARCHAR(40) NOT NULL DEFAULT 'system';
ALTER TABLE "churches" ADD COLUMN "projection_font_size_pt" SMALLINT NOT NULL DEFAULT 88;
ALTER TABLE "churches" ADD COLUMN "projection_default_background" VARCHAR(64);
