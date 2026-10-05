import { z } from 'zod';

/**
 * Vacia cuenta como ausente. El compose de produccion pasa `${VAR:-}`, que
 * llega como cadena vacia y no como `undefined`.
 */
const blankAsMissing = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const secret = (name: string) =>
  z.string().min(32, `${name} debe tener al menos 32 caracteres`);

/**
 * Esquema del entorno. Se valida al arrancar: si falta una variable o viene mal,
 * el proceso muere de inmediato con un mensaje claro en vez de fallar en la
 * primera peticion.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Valor de desarrollo: en la Mac corren varios APIs a la vez (lavendimia usa
  // el 3010). Dentro de Docker el compose fija el 3001 de la casa.
  PORT: z.coerce.number().int().positive().default(3020),

  DATABASE_URL: z.string().min(1, 'Falta la cadena de conexion a PostgreSQL'),
  SHADOW_DATABASE_URL: z.string().optional(),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  /** Vida del access token. Corto: es lo que viaja en cada peticion. */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  /**
   * Firma los refresh tokens. Aparte del secreto del JWT para poder rotar uno
   * sin cerrar todas las sesiones de las consolas.
   */
  REFRESH_TOKEN_SECRET: secret('REFRESH_TOKEN_SECRET'),
  /**
   * Dias de inactividad tras los que una sesion caduca. Se corren en cada
   * refresh: una consola que se usa cada semana nunca vuelve a pedir la
   * contrasena; una olvidada en un cajon pierde el acceso a los 60 dias.
   */
  REFRESH_TOKEN_IDLE_DAYS: z.coerce.number().int().positive().default(60),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  /** Freno general, por IP. Holgado: una pantalla dispara varias peticiones. */
  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  /** Intentos de login por IP. Estrecho: frena a quien prueba contrasenas. */
  LOGIN_THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  LOGIN_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),

  /** Sin estas dos, en desarrollo el correo cae al log (ver MailModule). */
  MAIL_FROM: blankAsMissing(z.string().optional()),
  RESEND_API_KEY: blankAsMissing(z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validador que consume `@nestjs/config`. Junta todos los errores en un solo
 * mensaje: enterarse de las cinco variables que faltan de una vez es mejor que
 * descubrirlas de a una.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variables de entorno invalidas:\n${details}`);
  }

  return result.data;
}
