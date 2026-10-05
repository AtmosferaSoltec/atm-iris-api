/**
 * Codigos de error estables. El `message` que los acompana esta en espanol y
 * puede cambiar sin aviso; el codigo es el contrato con los clientes (web,
 * iPad, Windows) y no.
 */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Autenticacion
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  /** El refresh token no sirve: vencio, se revoco o se reuso. Hay que iniciar sesion. */
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  /** La cuenta no tiene ninguna iglesia activa a la que entrar. */
  NO_CHURCH_ACCESS: 'NO_CHURCH_ACCESS',
  RESET_CODE_INVALID: 'RESET_CODE_INVALID',
  RESET_LIMIT_REACHED: 'RESET_LIMIT_REACHED',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
