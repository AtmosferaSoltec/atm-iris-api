import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { REQUEST_ID_HEADER } from './common/middleware/request-id.middleware.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import type { Env } from './config/env.schema.js';

export const API_PREFIX = 'api/v1';

/** Configuracion compartida por el arranque real y los e2e. */
export function configureApp(
  app: NestExpressApplication,
  config: ConfigService<Env, true>,
): void {
  app.setGlobalPrefix(API_PREFIX);

  // La web llama al API desde su servidor y reenvia la IP del visitante en
  // X-Forwarded-For. Sin confiar en ese salto, el limitador veria siempre la IP
  // del contenedor web y cinco fallos de cualquiera dejarian fuera a todos.
  // Solo rangos privados, nunca `true`: con `true` cualquiera inventa su IP en
  // cada intento y el limitador queda decorativo.
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  app.use(helmet());

  // La importacion de canciones manda hasta 50 letras completas en un cuerpo;
  // el limite por defecto de Express (100 KB) no alcanza.
  app.useBodyParser('json', { limit: '2mb' });

  // Las consolas nativas no usan CORS; esto solo afecta a navegadores. Sin
  // `credentials`: el API no usa cookies, los tokens van en el header.
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(','),
    // Sin esto el navegador esconde el header y la web no puede citarlo.
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  // Sin ValidationPipe global: valida Zod, endpoint por endpoint.
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
}
