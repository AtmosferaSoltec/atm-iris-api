import { PlanItemKind } from '../../generated/prisma/client.js';
import type { ServicePlanItem as ServicePlanItemRow } from '../../generated/prisma/client.js';
import type {
  PlanItemKindName,
  ServicePlanItem,
} from './service-plan.types.js';

export const toPlanItemKind = (kind: PlanItemKindName): PlanItemKind =>
  kind.toUpperCase() as PlanItemKind;

export const toPlanItemKindName = (kind: PlanItemKind): PlanItemKindName =>
  kind.toLowerCase() as PlanItemKindName;

export function toServicePlanItem(row: ServicePlanItemRow): ServicePlanItem {
  return {
    id: row.id,
    kind: toPlanItemKindName(row.kind),
    refId: row.refId,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
