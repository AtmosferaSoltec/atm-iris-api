/**
 * Frenos por endpoint, por IP y por ventana.
 *
 * Se leen del entorno y no del `ConfigService` porque `@Throttle` es un
 * decorador: se evalua al cargar la clase, antes de que exista la inyeccion de
 * dependencias. Es la misma razon por la que `ThrottlerModule.forRoot` lee
 * `process.env` en `app.module.ts`.
 */
export const LOGIN_THROTTLE = {
  ttl: Number(process.env.LOGIN_THROTTLE_TTL ?? 60) * 1000,
  limit: Number(process.env.LOGIN_THROTTLE_LIMIT ?? 5),
};

const HOUR = 60 * 60 * 1000;

/** Crear cuentas: suficiente para una iglesia, poco para un script. */
export const SIGN_UP_THROTTLE = {
  ttl: HOUR,
  limit: Number(process.env.SIGN_UP_THROTTLE_LIMIT ?? 5),
};

/** Pedir codigos. El tope por usuario y por dia lo aplica el servicio. */
export const FORGOT_PASSWORD_THROTTLE = {
  ttl: HOUR,
  limit: Number(process.env.FORGOT_THROTTLE_LIMIT ?? 3),
};

/** Probar codigos. El tope por codigo (5 intentos) lo aplica el servicio. */
export const RESET_CODE_THROTTLE = {
  ttl: 15 * 60 * 1000,
  limit: Number(process.env.RESET_CODE_THROTTLE_LIMIT ?? 10),
};

/** Vida del codigo de recuperacion. */
export const RESET_CODE_TTL_MINUTES = 15;

/** Envios de codigo permitidos por usuario cada 24 horas. */
export const RESET_MAX_REQUESTS_PER_DAY = 3;

/**
 * Intentos de verificacion por codigo. Seis digitos son un millon de
 * combinaciones: sin este tope, un script las prueba todas en minutos.
 */
export const RESET_MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Ventana en la que el refresh token anterior todavia se acepta, sin rotar ni
 * revocar. Las apps disparan peticiones en paralelo: si dos refrescan a la vez,
 * la segunda llega con el token que la primera acaba de cambiar.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 30;
