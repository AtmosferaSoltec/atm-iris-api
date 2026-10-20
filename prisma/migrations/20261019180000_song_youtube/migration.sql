-- La pista de una cancion tambien puede ser un video de YouTube (o YouTube
-- Music): se guarda solo el id y se reproduce con el reproductor de YouTube,
-- sin descargar nada (contrato §10). Audio subido o YouTube, no los dos.

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "youtube_id" VARCHAR(11);
