import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { StoragePort } from '../../integrations/storage/storage.port.js';
import { PURGE_AFTER_HOURS } from './media.constants.js';
import { MediaRepository } from './media.repository.js';

/** Cuantos objetos se procesan por pasada, para no bloquear el proceso. */
const BATCH = 200;

/**
 * Limpieza horaria del almacenamiento:
 * (a) subidas vencidas sin confirmar: se borra el objeto (si llego a subirse) y
 *     el ticket, lo que libera la cuota reservada;
 * (b) audios sin cancion hace mas de 24 h (una pista subida en el editor que
 *     nunca se guardo, contrato §10): se borran, lo que libera la cuota;
 * (c) medios borrados hace mas de 24 h: se borra el archivo y se marca
 *     `object_deleted_at`.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'media-cleanup' })
  async run(): Promise<void> {
    if (!this.storage.isConfigured) return;

    try {
      const uploads = await this.purgeExpiredUploads();
      const orphans = await this.deleteOrphanTracks();
      const objects = await this.purgeDeletedObjects();
      if (uploads + orphans + objects > 0) {
        this.logger.log(
          `Limpieza de multimedia: ${uploads} subidas vencidas, ${orphans} pistas sin canción y ${objects} archivos borrados`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Fallo la limpieza de multimedia',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async purgeExpiredUploads(): Promise<number> {
    const uploads = await this.repository.findExpiredUploads(BATCH);
    for (const upload of uploads) {
      await this.storage.deleteObject(upload.objectKey);
    }
    await this.repository.deleteUploads(uploads.map((u) => u.id));
    return uploads.length;
  }

  private async deleteOrphanTracks(): Promise<number> {
    const before = new Date(Date.now() - PURGE_AFTER_HOURS * 60 * 60 * 1000);
    const tracks = await this.repository.findOrphanTracks(before, BATCH);

    const byChurch = new Map<string, string[]>();
    for (const track of tracks) {
      byChurch.set(track.churchId, [...(byChurch.get(track.churchId) ?? []), track.id]);
    }
    for (const [churchId, ids] of byChurch) {
      await this.repository.softDeleteOrphanTracks(churchId, ids);
    }
    return tracks.length;
  }

  private async purgeDeletedObjects(): Promise<number> {
    const before = new Date(Date.now() - PURGE_AFTER_HOURS * 60 * 60 * 1000);
    const assets = await this.repository.findAssetsToPurge(before, BATCH);

    const byChurch = new Map<string, string[]>();
    for (const asset of assets) {
      await this.storage.deleteObject(asset.objectKey);
      byChurch.set(asset.churchId, [...(byChurch.get(asset.churchId) ?? []), asset.id]);
    }
    for (const [churchId, ids] of byChurch) {
      await this.repository.markObjectsDeleted(churchId, ids);
    }
    return assets.length;
  }
}
