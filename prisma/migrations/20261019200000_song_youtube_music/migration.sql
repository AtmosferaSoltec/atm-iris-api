-- La pista de YouTube recuerda si el enlace era de YouTube Music (solo la
-- musica) o de YouTube (con video): solo cambia como se muestra (contrato §10).

-- AlterTable
ALTER TABLE "songs" ADD COLUMN     "youtube_music" BOOLEAN NOT NULL DEFAULT false;
