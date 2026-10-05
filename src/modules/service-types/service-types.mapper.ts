import type {
  BlockTemplate as BlockTemplateRow,
  ServiceType as ServiceTypeRow,
} from '../../generated/prisma/client.js';
import type { ServiceType } from './service-types.types.js';

export type ServiceTypeWithBlocks = ServiceTypeRow & {
  blocks: BlockTemplateRow[];
};

export function toServiceType(row: ServiceTypeWithBlocks): ServiceType {
  const hasSchedule =
    row.scheduleWeekday !== null &&
    row.scheduleHour !== null &&
    row.scheduleMinute !== null;

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    schedule: hasSchedule
      ? {
          weekday: row.scheduleWeekday!,
          hour: row.scheduleHour!,
          minute: row.scheduleMinute!,
        }
      : null,
    blocks: [...row.blocks]
      .sort((a, b) => a.position - b.position)
      .map((block) => ({
        id: block.id,
        name: block.name,
        plannedMinutes: block.plannedMinutes,
        defaultPersonId: block.defaultPersonId,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
