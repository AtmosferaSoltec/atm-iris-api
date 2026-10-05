/**
 * Puerto de almacenamiento de archivos (S3 compatible). `StorageModule` elige
 * la implementacion: `S3StorageService` con credenciales y
 * `UnconfiguredStorageService` sin ellas (solo en desarrollo).
 *
 * La API nunca recibe ni sirve los bytes: entrega URLs firmadas y los clientes
 * hablan directo con el almacenamiento.
 */
export abstract class StoragePort {
  /** false si el API arranco sin almacenamiento (desarrollo). */
  abstract readonly isConfigured: boolean;

  /** URL firmada para un `PUT` con ese `Content-Type`. */
  abstract createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  /** URL firmada para un `GET`, con el nombre original al descargar. */
  abstract createDownloadUrl(
    key: string,
    expiresInSeconds: number,
    fileName: string,
  ): Promise<string>;

  /** Tamano del objeto, o null si no existe. */
  abstract headObject(key: string): Promise<{ sizeBytes: number } | null>;

  /** Borra el objeto. No falla si ya no existe. */
  abstract deleteObject(key: string): Promise<void>;

  /** Para `/health`: lanza si el bucket no responde. */
  abstract ping(): Promise<void>;
}
