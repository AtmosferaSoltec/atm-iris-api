import type { ChurchRole } from '../auth/auth.types.js';

/** Vida de una invitacion. */
export const INVITATION_TTL_DAYS = 7;

/**
 * Aceptar invitaciones, por IP. Como el decorador `@Throttle` se evalua al
 * cargar la clase, se lee de `process.env` (ver auth.constants.ts).
 */
export const INVITATION_ACCEPT_THROTTLE = {
  ttl: 15 * 60 * 1000,
  limit: Number(process.env.INVITATION_THROTTLE_LIMIT ?? 10),
};

/** Como se nombra cada rol en los correos. */
export const ROLE_LABELS: Record<ChurchRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  operator: 'Operador',
};
