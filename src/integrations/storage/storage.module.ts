import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isProduction } from '../../config/app.config.js';
import type { Env } from '../../config/env.schema.js';
import { S3StorageService } from './s3-storage.service.js';
import { StoragePort } from './storage.port.js';
import { UnconfiguredStorageService } from './unconfigured-storage.service.js';

/**
 * Elige la implementacion segun el entorno, como `MailModule`: en desarrollo
 * sin credenciales el API arranca y solo pierde la multimedia; en produccion
 * faltar el almacenamiento tumba el arranque.
 */
export function resolveStorageService(
  config: ConfigService<Env, true>,
): StoragePort {
  const endpoint = config.get('STORAGE_ENDPOINT', { infer: true });
  const accessKeyId = config.get('STORAGE_ACCESS_KEY_ID', { infer: true });
  const secretAccessKey = config.get('STORAGE_SECRET_ACCESS_KEY', { infer: true });

  if (endpoint && accessKeyId && secretAccessKey) {
    return new S3StorageService({
      STORAGE_ENDPOINT: endpoint,
      STORAGE_REGION: config.get('STORAGE_REGION', { infer: true }),
      STORAGE_ACCESS_KEY_ID: accessKeyId,
      STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
      STORAGE_BUCKET: config.get('STORAGE_BUCKET', { infer: true }),
      STORAGE_FORCE_PATH_STYLE: config.get('STORAGE_FORCE_PATH_STYLE', { infer: true }),
      // `||` y no `??`: si la variable validada queda sin valor, `ConfigService`
      // devuelve el texto crudo de `process.env`, que puede ser "".
      STORAGE_PUBLIC_ENDPOINT:
        config.get('STORAGE_PUBLIC_ENDPOINT', { infer: true }) || undefined,
    });
  }

  if (isProduction(config)) {
    throw new Error(
      'Faltan STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID o STORAGE_SECRET_ACCESS_KEY. ' +
        'En produccion la multimedia necesita almacenamiento.',
    );
  }

  new Logger('StorageModule').warn(
    'Almacenamiento sin configurar: las subidas y descargas de multimedia responden 503.',
  );
  return new UnconfiguredStorageService();
}

@Global()
@Module({
  providers: [
    {
      provide: StoragePort,
      inject: [ConfigService],
      useFactory: resolveStorageService,
    },
  ],
  exports: [StoragePort],
})
export class StorageModule {}
