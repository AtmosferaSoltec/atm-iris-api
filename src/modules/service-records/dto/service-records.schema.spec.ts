import { describe, expect, it } from 'vitest';

import { serviceRecordInputSchema } from './service-records.schema.js';

const block = (status: string, id: string) => ({
  id,
  name: 'Bienvenida',
  plannedSeconds: 600,
  actualSeconds: 0,
  personId: null,
  personName: null,
  status,
});

const record = (blocks: unknown[], status?: string) => ({
  ...(status ? { status } : {}),
  date: '2026-10-04T15:00:00.000Z',
  serviceTypeId: 'st-1',
  serviceTypeName: 'Culto',
  blocks,
});

const ids = [
  '6f1c1c39-6a59-4a5e-9a39-3f7d0f3c3a01',
  '6f1c1c39-6a59-4a5e-9a39-3f7d0f3c3a02',
];

describe('serviceRecordInputSchema', () => {
  it('sin status (consola anterior) queda terminado, sin horas de bloque', () => {
    const parsed = serviceRecordInputSchema.parse(
      record([block('completed', ids[0]!)]),
    );
    expect(parsed.status).toBe('finished');
    expect(parsed.blocks[0]).toMatchObject({ startedAt: null, endedAt: null });
  });

  it('en curso acepta pendientes y un bloque corriendo con su inicio', () => {
    const parsed = serviceRecordInputSchema.parse(
      record(
        [
          {
            ...block('running', ids[0]!),
            startedAt: '2026-10-04T15:00:00.000Z',
          },
          block('pending', ids[1]!),
        ],
        'inProgress',
      ),
    );
    expect(parsed.blocks[0]!.startedAt).toEqual(
      new Date('2026-10-04T15:00:00.000Z'),
    );
  });

  it('terminado no acepta bloques pendientes ni corriendo', () => {
    const result = serviceRecordInputSchema.safeParse(
      record([block('pending', ids[0]!)], 'finished'),
    );
    expect(result.success).toBe(false);
  });

  it('solo un bloque corriendo', () => {
    const result = serviceRecordInputSchema.safeParse(
      record(
        [block('running', ids[0]!), block('running', ids[1]!)],
        'inProgress',
      ),
    );
    expect(result.success).toBe(false);
  });
});
