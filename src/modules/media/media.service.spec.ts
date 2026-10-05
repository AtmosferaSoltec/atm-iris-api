import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoragePort } from '../../integrations/storage/storage.port.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { CreateUploadInput } from './dto/media.schema.js';
import { objectKeyFor } from './media.keys.js';
import type { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';

const MB = 1024 * 1024;
const user: AuthenticatedUser = {
  userId: 'u-1',
  churchId: 'church-1',
  sessionId: 's-1',
  role: 'admin',
};
const upload = (overrides: Partial<CreateUploadInput> = {}): CreateUploadInput => ({
  kind: 'image',
  fileName: 'Fondo.png',
  contentType: 'image/png',
  sizeBytes: 2 * MB,
  ...overrides,
});

function setup() {
  const repository = {
    withLock: vi.fn((_c: string, work: (tx: unknown) => unknown) => work('tx')),
    quotaBytes: vi.fn().mockResolvedValue(BigInt(10 * MB)),
    usedBytes: vi.fn().mockResolvedValue(0n),
    pendingBytes: vi.fn().mockResolvedValue(0n),
    createUpload: vi.fn(),
  };
  const storage = {
    isConfigured: true,
    ping: vi.fn(),
    createUploadUrl: vi.fn().mockResolvedValue('http://minio/firmada'),
  };
  const service = new MediaService(
    repository as unknown as MediaRepository,
    storage as unknown as StoragePort,
  );
  return { repository, storage, service };
}

describe('MediaService · validacion de subidas', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('rechaza un tipo no permitido para el kind (415)', async () => {
    await expect(
      ctx.service.createUpload(user, upload({ contentType: 'image/gif' })),
    ).rejects.toMatchObject({ status: 415, response: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    await expect(
      ctx.service.createUpload(user, upload({ kind: 'audio', contentType: 'video/mp4' })),
    ).rejects.toMatchObject({ response: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it('rechaza lo que supera el maximo del kind (413)', async () => {
    await expect(
      ctx.service.createUpload(user, upload({ sizeBytes: 20 * MB + 1 })),
    ).rejects.toMatchObject({ status: 413, response: { code: 'FILE_TOO_LARGE' } });
  });

  it('acepta justo el maximo', async () => {
    ctx.repository.quotaBytes.mockResolvedValue(BigInt(100 * MB));
    await expect(ctx.service.createUpload(user, upload({ sizeBytes: 20 * MB }))).resolves.toBeDefined();
  });

  it('la cuota cuenta lo usado y lo reservado por subidas pendientes', async () => {
    ctx.repository.usedBytes.mockResolvedValue(BigInt(6 * MB));
    ctx.repository.pendingBytes.mockResolvedValue(BigInt(3 * MB));
    await expect(ctx.service.createUpload(user, upload({ sizeBytes: 2 * MB }))).rejects.toMatchObject({
      status: 413,
      response: { code: 'STORAGE_QUOTA_EXCEEDED' },
    });
    expect(ctx.repository.createUpload).not.toHaveBeenCalled();
  });

  it('entrega el ticket con el Content-Type a mandar y reserva por una hora', async () => {
    const ticket = await ctx.service.createUpload(user, upload());
    const saved = ctx.repository.createUpload.mock.calls[0]![1];

    expect(ticket).toMatchObject({
      uploadId: saved.id,
      uploadUrl: 'http://minio/firmada',
      headers: { 'Content-Type': 'image/png' },
    });
    expect(saved.objectKey).toBe(`churches/church-1/media/${saved.id}/Fondo.png`);
    const minutes = (new Date(ticket.expiresAt).getTime() - Date.now()) / 60_000;
    expect(Math.round(minutes)).toBe(60);
  });
});

describe('objectKeyFor', () => {
  it('sanea el nombre: sin acentos, espacios ni simbolos', () => {
    expect(objectKeyFor('c', 'i', 'Canción de ñandú (final).mp3')).toBe(
      'churches/c/media/i/Cancion-de-nandu-final-.mp3',
    );
    expect(objectKeyFor('c', 'i', '...')).toBe('churches/c/media/i/archivo');
  });
});
