-- Las plantillas ya no llevan responsable: quien dirige cada bloque se registra
-- en cada servicio (block_records.person_id), porque rota cada semana.
ALTER TABLE "block_templates" DROP CONSTRAINT "block_templates_default_person_id_fkey";
ALTER TABLE "block_templates" DROP COLUMN "default_person_id";
