import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../constants/permissions.js';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Exige todos los permisos indicados. La API pregunta por permiso, nunca por
 * nombre de rol: asi un rol nuevo no obliga a revisar cada endpoint.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
