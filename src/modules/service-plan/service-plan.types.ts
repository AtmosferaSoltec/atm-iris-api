/** Contrato §15. */
/** `bible`: un pasaje, con `refId` como `rvr1909:JHN.3.16-18` (ver `bible.passage.ts`). `youtube`: un video de la biblioteca, con su `id` como `refId`. */
export type PlanItemKindName = 'song' | 'media' | 'bible' | 'youtube';

export type ServicePlanItem = {
  id: string;
  kind: PlanItemKindName;
  refId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};
