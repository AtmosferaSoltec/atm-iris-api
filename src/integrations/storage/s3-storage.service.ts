import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { Env } from '../../config/env.schema.js';
import { StoragePort } from './storage.port.js';

type StorageEnv = Required<
  Pick<
    Env,
    | 'STORAGE_ENDPOINT'
    | 'STORAGE_REGION'
    | 'STORAGE_ACCESS_KEY_ID'
    | 'STORAGE_SECRET_ACCESS_KEY'
    | 'STORAGE_BUCKET'
    | 'STORAGE_FORCE_PATH_STYLE'
  >
> &
  Pick<Env, 'STORAGE_PUBLIC_ENDPOINT'>;

/**
 * Almacenamiento S3 compatible: MinIO en local, Cloudflare R2 en produccion.
 *
 * Dos clientes: uno para lo que hace el propio API (HEAD, DELETE) y otro solo
 * para firmar. La firma incluye el host, y el host que sirve al API
 * (`localhost:9000`) no le sirve a la PC de Windows en la red local.
 */
export class S3StorageService extends StoragePort {
  readonly isConfigured = true;

  private readonly client: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(env: StorageEnv) {
    super();

    const base: S3ClientConfig = {
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      },
    };

    this.client = new S3Client({ ...base, endpoint: env.STORAGE_ENDPOINT });
    this.signer = new S3Client({
      ...base,
      endpoint: env.STORAGE_PUBLIC_ENDPOINT || env.STORAGE_ENDPOINT,
    });
    this.bucket = env.STORAGE_BUCKET;
  }

  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      {
        expiresIn: expiresInSeconds,
        // El Content-Type entra en la firma: subir otro tipo que el declarado
        // (y validado) invalida la URL. El tamano se comprueba al confirmar.
        signableHeaders: new Set(['content-type']),
      },
    );
  }

  createDownloadUrl(
    key: string,
    expiresInSeconds: number,
    fileName: string,
  ): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(fileName),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async headObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: head.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof NotFound || isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  return status === 404;
}

/**
 * `attachment` con el nombre original. Dos formas: `filename` en ASCII para
 * clientes viejos y `filename*` en UTF-8 para que "Canción.mp3" llegue intacto.
 */
function contentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7E]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
