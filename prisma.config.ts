// Prisma 7 ya no lee el .env por su cuenta: hay que cargarlo a mano.
import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Configuracion de las herramientas de Prisma (migrate, studio).
 *
 * Desde la version 7 las URLs de conexion salieron de schema.prisma. En tiempo
 * de ejecucion el cliente se conecta por un driver adapter (ver src/database/).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',

  datasource: {
    url: env('DATABASE_URL'),
    // Base desechable que `migrate dev` reconstruye para verificar las
    // migraciones. Solo existe en local: en produccion `migrate deploy` aplica
    // las ya escritas y declararla haria fallar el contenedor de migraciones.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
      : {}),
  },

  migrations: {
    path: 'prisma/migrations',
  },
});
