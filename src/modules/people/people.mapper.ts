import type { Person as PersonRow } from '../../generated/prisma/client.js';
import type { Person } from './people.types.js';

export function toPerson(row: PersonRow, blockCount = 0): Person {
  return {
    id: row.id,
    name: row.name,
    blockCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
