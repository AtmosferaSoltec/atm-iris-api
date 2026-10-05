import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { API_SCHEMAS } from './common/swagger/api-schemas.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService<Env, true>);

  app.useLogger(app.get(Logger));
  configureApp(app, config);

  // Swagger solo fuera de produccion: documenta la superficie de ataque.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Iris API')
        .setDescription(
          'Cuentas, iglesias y contenido para la web y las consolas de iPad y Windows',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    // Los tipos del contrato, escritos a mano en api-schemas.ts (no hay DTO de clase).
    document.components = {
      ...document.components,
      schemas: { ...document.components?.schemas, ...API_SCHEMAS },
    };
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
  }

  // Docker detiene el contenedor cerrando el pool de conexiones.
  app.enableShutdownHooks();

  // Todas las interfaces: la PC de Windows llega por la IP de la Mac en la red
  // local durante la integracion.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

await bootstrap();
