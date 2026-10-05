-- NO ACTION en lugar de RESTRICT: se comprueba al final de la sentencia, asi borrar
-- una iglesia (que cae en cascada sobre sus tipos y sus registros) no falla por el orden.

-- DropForeignKey
ALTER TABLE "service_records" DROP CONSTRAINT "service_records_service_type_id_fkey";

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

