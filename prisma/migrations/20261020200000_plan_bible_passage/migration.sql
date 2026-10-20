-- El plan tambien guarda pasajes de la Biblia (contrato §15): `ref_id` es la
-- traduccion, el libro, el capitulo y los versiculos (`rvr1909:JHN.3.16-18`).

-- AlterEnum
ALTER TYPE "plan_item_kind" ADD VALUE 'BIBLE';
