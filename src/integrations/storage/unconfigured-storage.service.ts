import { ServiceUnavailableException } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { StoragePort } from './storage.port.js';

/**
 * Lo que queda cuando el API arranca sin almacenamiento (solo en desarrollo):
 * todo lo que necesite archivos responde 503 con un mensaje que dice que falta,
 * en lugar de fallar con un error de red incomprensible.
 */
export class UnconfiguredStorageService extends StoragePort {
  readonly isConfigured = false;

  createUploadUrl(): Promise<string> {
    return Promise.reject(unavailable());
  }

  createDownloadUrl(): Promise<string> {
    return Promise.reject(unavailable());
  }

  headObject(): Promise<{ sizeBytes: number } | null> {
    return Promise.reject(unavailable());
  }

  deleteObject(): Promise<void> {
    return Promise.reject(unavailable());
  }

  ping(): Promise<void> {
    return Promise.reject(unavailable());
  }
}

const unavailable = () =>
  new ServiceUnavailableException({
    code: API_ERROR_CODES.STORAGE_UNAVAILABLE,
    message:
      'El almacenamiento de archivos no está configurado en este servidor. ' +
      'Revisa las variables STORAGE_* del API.',
  });
