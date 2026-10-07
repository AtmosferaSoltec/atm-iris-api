import { describe, expect, it } from 'vitest';

import { toChurch } from './church.mapper.js';

const row = {
  id: 'church-1',
  name: 'Iglesia Vida Nueva',
  timezone: 'America/Lima',
  bibleEnabled: true,
  multimediaEnabled: true,
  timeControlEnabled: true,
  storageQuotaBytes: 5368709120n,
  projectionFontFamily: 'system',
  projectionFontSizePt: 88,
  projectionDefaultBackground: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('toChurch', () => {
  it('suma las tres secciones del almacenamiento en usedBytes', () => {
    const church = toChurch(row as never, {
      music: 300n,
      backgrounds: 20n,
      media: 1000n,
    });
    expect(church.storage).toEqual({
      usedBytes: 1320,
      quotaBytes: 5368709120,
      breakdown: { musicBytes: 300, backgroundBytes: 20, mediaBytes: 1000 },
    });
  });

  it('sin medios todo es cero', () => {
    expect(toChurch(row as never).storage.breakdown).toEqual({
      musicBytes: 0,
      backgroundBytes: 0,
      mediaBytes: 0,
    });
  });
});
