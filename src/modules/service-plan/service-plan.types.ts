/** Contrato §15. */
export type PlanItemKindName = 'song' | 'media';

export type ServicePlanItem = {
  id: string;
  kind: PlanItemKindName;
  refId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};
