/**
 * Contrato de error. La web lo lee en `src/server/repositories/api/client.ts`:
 * si cambia aqui, cambia alla.
 */
export type ApiErrorBody = {
  statusCode: number;
  /** Codigo estable en ingles: lo lee el codigo del cliente. */
  code: string;
  /** Mensaje en espanol: lo lee el usuario. */
  message: string;
  /** Errores por campo, cuando falla la validacion. */
  errors?: Record<string, string>;
  timestamp: string;
  path: string;
};
