import { describe, expect, it } from 'vitest';

import { compareVersions } from './app-versions.util.js';

describe('compareVersions', () => {
  it('compara por numero y no por texto', () => {
    expect(compareVersions('1.0.9', '1.0.10')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('trata las partes que faltan como cero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBeLessThan(0);
  });

  it('una version igual no es menor', () => {
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
  });
});
