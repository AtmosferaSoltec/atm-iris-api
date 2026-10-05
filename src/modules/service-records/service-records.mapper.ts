import type {
  BlockRecord as BlockRecordRow,
  BlockStatus,
  ServiceRecord as ServiceRecordRow,
} from '../../generated/prisma/client.js';
import type { BlockStatusName, ServiceRecord } from './service-records.types.js';

export type ServiceRecordWithBlocks = ServiceRecordRow & { blocks: BlockRecordRow[] };

export const toBlockStatus = (status: BlockStatus): BlockStatusName =>
  status.toLowerCase() as BlockStatusName;

export const toDbBlockStatus = (status: BlockStatusName): BlockStatus =>
  status.toUpperCase() as BlockStatus;

export function toServiceRecord(row: ServiceRecordWithBlocks): ServiceRecord {
  return {
    id: row.id,
    date: row.date.toISOString(),
    serviceTypeId: row.serviceTypeId,
    serviceTypeName: row.serviceTypeName,
    blocks: [...row.blocks]
      .sort((a, b) => a.position - b.position)
      .map((block) => ({
        id: block.id,
        name: block.name,
        plannedSeconds: block.plannedSeconds,
        actualSeconds: block.actualSeconds,
        personId: block.personId,
        personName: block.personName,
        status: toBlockStatus(block.status),
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
