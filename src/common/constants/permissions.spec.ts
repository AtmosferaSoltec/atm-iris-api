import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from './permissions.js';

/** La tabla del contrato §3, tal cual. */
const CONTRACT: Record<string, [owner: boolean, admin: boolean, operator: boolean]> = {
  'church.manage': [true, true, false],
  'modules.manage': [true, true, false],
  'members.manage': [true, true, false],
  'songs.manage': [true, true, false],
  'media.manage': [true, true, false],
  'serviceTypes.manage': [true, true, false],
  'people.manage': [true, true, true],
  'records.write': [true, true, true],
  'records.manage': [true, true, false],
};

describe('ROLE_PERMISSIONS', () => {
  it('tiene exactamente los permisos del contrato', () => {
    expect([...PERMISSIONS].sort()).toEqual(Object.keys(CONTRACT).sort());
  });

  it.each(Object.entries(CONTRACT))('%s coincide con la tabla', (permission, row) => {
    const [owner, admin, operator] = row;
    const p = permission as (typeof PERMISSIONS)[number];
    expect(hasPermission('owner', p)).toBe(owner);
    expect(hasPermission('admin', p)).toBe(admin);
    expect(hasPermission('operator', p)).toBe(operator);
  });

  it('owner y admin tienen los 9; operator, 2', () => {
    expect(ROLE_PERMISSIONS.owner).toHaveLength(9);
    expect(ROLE_PERMISSIONS.admin).toHaveLength(9);
    expect(ROLE_PERMISSIONS.operator).toEqual(['people.manage', 'records.write']);
  });
});
