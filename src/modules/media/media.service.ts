import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  pageWindow,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.schema.js';
import { notFound } from '../../common/exceptions/api-errors.js';
import { StoragePort } from '../../integrations/storage/storage.port.js';
import { nameKey } from '../../shared/utils/text.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type {
  ConfirmUploadInput,
  CreateUploadInput,
  ListMediaQuery,
  UpdateMediaInput,
} from './dto/media.schema.js';
import { backgroundProblem } from './media.background.js';
import {
  DOWNLOAD_TTL_SECONDS,
  MEDIA_RULES,
  UPLOAD_TTL_SECONDS,
} from './media.constants.js';
import { objectKeyFor } from './media.keys.js';
import { toDbMediaKind, toMediaAsset } from './media.mapper.js';
import { MediaRepository } from './media.repository.js';
import type { DownloadUrl, MediaAsset, UploadTicket } from './media.types.js';

export type ConfirmedAsset = { asset: MediaAsset; isNew: boolean };

/**
 * Multimedia (contrato §11). Los bytes nunca pasan por aqui: el cliente sube y
 * descarga directo del almacenamiento con URLs firmadas; este servicio valida,
 * reserva cuota y lleva el registro.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
  ) {}

  /**
   * Paso 1: valida tipo, tamano y cuota, reserva el espacio por una hora y
   * entrega la URL firmada para el PUT.
   */
  async createUpload(
    user: AuthenticatedUser,
    input: CreateUploadInput,
  ): Promise<UploadTicket> {
    const rules = MEDIA_RULES[input.kind];

    if (!rules.contentTypes.includes(input.contentType)) {
      throw new HttpException(
        {
          code: API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          message: `Ese tipo de archivo no se admite. Usa ${rules.contentTypes.join(', ')}.`,
          errors: { contentType: 'Tipo de archivo no admitido.' },
        },
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    if (input.sizeBytes > rules.maxBytes) {
      throw new HttpException(
        {
          code: API_ERROR_CODES.FILE_TOO_LARGE,
          message: `El archivo supera el máximo de ${formatBytes(rules.maxBytes)}.`,
          errors: { sizeBytes: 'El archivo es demasiado grande.' },
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // Antes que la base: sin almacenamiento no tiene sentido reservar cuota.
    if (!this.storage.isConfigured) await this.storage.ping();

    const id = randomUUID();
    const objectKey = objectKeyFor(user.churchId, id, input.fileName);
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000);

    // La cuota se mira y se reserva bajo el candado de la iglesia: dos subidas
    // simultaneas no pueden pasar las dos por el mismo hueco.
    await this.repository.withLock(user.churchId, async (tx) => {
      const [quota, used, pending] = await Promise.all([
        this.repository.quotaBytes(user.churchId, tx),
        this.repository.usedBytes(user.churchId, tx),
        this.repository.pendingBytes(user.churchId, tx),
      ]);

      if (used + pending + BigInt(input.sizeBytes) > quota) {
        throw new HttpException(
          {
            code: API_ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
            message: `No queda espacio: la iglesia usa ${formatBytes(Number(used))} de ${formatBytes(Number(quota))}. Borra archivos que ya no uses.`,
          },
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }

      await this.repository.createUpload(
        user.churchId,
        {
          id,
          kind: toDbMediaKind(input.kind),
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: BigInt(input.sizeBytes),
          objectKey,
          expiresAt,
          createdByUserId: user.userId,
        },
        tx,
      );
    });

    return {
      uploadId: id,
      uploadUrl: await this.storage.createUploadUrl(
        objectKey,
        input.contentType,
        UPLOAD_TTL_SECONDS,
      ),
      headers: { 'Content-Type': input.contentType },
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Paso 3: el archivo ya esta en el almacenamiento. Se comprueba que exista y
   * mida lo declarado, y se crea el medio con el mismo id de la subida.
   *
   * Reintentar la confirmacion de una subida ya confirmada devuelve el medio
   * (200): si la respuesta se perdio en la red, el cliente no queda atascado.
   */
  confirmUpload(
    user: AuthenticatedUser,
    input: ConfirmUploadInput,
  ): Promise<ConfirmedAsset> {
    return this.repository.withLock(user.churchId, async (tx) => {
      const upload = await this.repository.findUpload(user.churchId, input.uploadId, tx);

      if (upload?.confirmedAt) {
        const existing = await this.repository.findActive(user.churchId, upload.id, tx);
        if (existing) return { asset: toMediaAsset(existing), isNew: false };
      }
      if (!upload || upload.confirmedAt || upload.expiresAt <= new Date()) {
        throw uploadNotFound();
      }

      const object = await this.storage.headObject(upload.objectKey);
      if (!object || BigInt(object.sizeBytes) !== upload.sizeBytes) {
        throw uploadNotFound();
      }

      const hasDuration = upload.kind !== 'IMAGE';
      const hasSize = upload.kind !== 'AUDIO';

      if (input.isBackground) {
        const problem = backgroundProblem({
          kind: upload.kind.toLowerCase() as 'image' | 'video' | 'audio',
          contentType: upload.contentType,
          sizeBytes: Number(upload.sizeBytes),
          width: input.width ?? null,
          height: input.height ?? null,
          durationSeconds: input.durationSeconds ?? null,
        });
        if (problem) throw invalidBackground(problem);
      }

      const row = await this.repository.confirmUpload(
        user.churchId,
        upload,
        {
          title: input.title,
          titleKey: nameKey(input.title),
          description: input.description,
          durationSeconds: hasDuration ? input.durationSeconds : null,
          width: hasSize ? input.width : null,
          height: hasSize ? input.height : null,
          isBackground: input.isBackground,
        },
        tx,
      );
      return { asset: toMediaAsset(row), isNew: true };
    });
  }

  async list(
    churchId: string,
    query: ListMediaQuery,
  ): Promise<Paginated<MediaAsset>> {
    const filters = {
      kinds: query.kind?.map(toDbMediaKind),
      titleKey: query.search ? nameKey(query.search) : undefined,
      isBackground: query.isBackground,
    };
    const [rows, total] = await Promise.all([
      this.repository.list(churchId, filters, pageWindow(query)),
      this.repository.count(churchId, filters),
    ]);
    return paginate(rows.map(toMediaAsset), total, query.page, query.limit);
  }

  async get(churchId: string, id: string): Promise<MediaAsset> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw mediaNotFound();
    return toMediaAsset(row);
  }

  async downloadUrl(churchId: string, id: string): Promise<DownloadUrl> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw mediaNotFound();

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000);
    return {
      url: await this.storage.createDownloadUrl(
        row.objectKey,
        DOWNLOAD_TTL_SECONDS,
        row.fileName,
      ),
      expiresAt: expiresAt.toISOString(),
    };
  }

  update(churchId: string, id: string, input: UpdateMediaInput): Promise<MediaAsset> {
    return this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw mediaNotFound();

      if (input.isBackground) {
        const problem = backgroundProblem({
          kind: current.kind.toLowerCase() as 'image' | 'video' | 'audio',
          contentType: current.contentType,
          sizeBytes: Number(current.sizeBytes),
          width: current.width,
          height: current.height,
          durationSeconds: current.durationSeconds,
        });
        if (problem) throw invalidBackground(problem);
      }

      const row = await this.repository.update(
        churchId,
        id,
        {
          ...(input.title !== undefined
            ? { title: input.title, titleKey: nameKey(input.title) }
            : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isBackground !== undefined
            ? { isBackground: input.isBackground }
            : {}),
        },
        tx,
      );
      return toMediaAsset(row);
    });
  }

  /** Libera la cuota al instante; el archivo lo borra la limpieza despues. */
  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw mediaNotFound();
      await this.repository.softDelete(churchId, id, tx);
    });
  }
}

const invalidBackground = (message: string) =>
  new BadRequestException({
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message,
    errors: { isBackground: message },
  });

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units[unit]}`;
}

const uploadNotFound = () =>
  new BadRequestException({
    code: API_ERROR_CODES.UPLOAD_NOT_FOUND,
    message:
      'No encontramos el archivo subido: la subida venció o el archivo no llegó completo. Vuelve a subirlo.',
  });

const mediaNotFound = () => notFound('Ese archivo no existe.');
