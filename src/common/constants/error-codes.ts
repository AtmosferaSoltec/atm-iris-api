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
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',

  // Equipo
  /** Quitar o degradar al unico dueno de la iglesia. */
  LAST_OWNER: 'LAST_OWNER',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  /** Invitacion inexistente, vencida, revocada o ya usada. */
  INVITATION_INVALID: 'INVITATION_INVALID',

  // Contenido de la iglesia
  PERSON_NAME_TAKEN: 'PERSON_NAME_TAKEN',
  SERVICE_TYPE_NAME_TAKEN: 'SERVICE_TYPE_NAME_TAKEN',
  /** Un id generado por el cliente ya pertenece a un recurso de otra iglesia. */
  ID_CONFLICT: 'ID_CONFLICT',

  // Multimedia
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  /** 503: el servidor arranco sin almacenamiento (solo en desarrollo). */
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
