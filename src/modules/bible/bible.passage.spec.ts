import { describe, expect, it } from 'vitest';

import { formatPassage, parsePassage } from './bible.passage.js';

describe('pasajes', () => {
  it('lee un versículo o un rango dentro de un capítulo', () => {
    expect(parsePassage('rvr1909:JHN.3.16')).toEqual({
      code: 'rvr1909',
      bookId: 'JHN',
      chapter: 3,
      from: 16,
      to: 16,
    });
    expect(parsePassage('rvr1909:PSA.23.1-6')?.to).toBe(6);
    expect(formatPassage(parsePassage('rvr1909:PSA.23.1-6')!)).toBe(
      'rvr1909:PSA.23.1-6',
    );
    expect(formatPassage(parsePassage('rvr1909:JHN.3.16')!)).toBe(
      'rvr1909:JHN.3.16',
    );
  });

  it('rechaza lo que no es un pasaje', () => {
    for (const ref of [
      'JHN.3.16',
      'rvr1909:jhn.3.16',
      'rvr1909:JHN.3',
      'rvr1909:JHN.3.18-16',
      'rvr1909:JHN.0.1',
      'otra cosa',
    ]) {
      expect(parsePassage(ref), ref).toBeNull();
    }
  });
});
