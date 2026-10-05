import type { ChurchRole } from '../../modules/auth/auth.types.js';

/**
 * Catalogo de permisos del contrato (§3). Los clientes deciden que mostrar con
 * esta lista y la API la comprueba en cada endpoint con `@RequirePermissions`.
 */
export const PERMISSIONS = [
  'church.manage',
  'modules.manage',
  'members.manage',
  'songs.manage',
  'media.manage',
  'serviceTypes.manage',
  'people.manage',
  'records.write',
  'records.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permisos de cada rol.
 *
 * Viven en codigo y no en tablas sembradas (desviacion aceptada de la casa):
 * Iris tiene tres roles fijos y ninguna pantalla para crear roles. Cuando la
 * haya, esto pasa a la base.
 *
 * `operator` tiene `people.manage` porque la consola agrega responsables al
 * vuelo durante el servicio.
 */
export const ROLE_PERMISSIONS: Record<ChurchRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  operator: ['people.manage', 'records.write'],
};

export function permissionsOf(role: ChurchRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: ChurchRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
