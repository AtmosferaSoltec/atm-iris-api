import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ARCHIVE_AFTER_MONTHS } from './songs.constants.js';
import { SongsRepository } from './songs.repository.js';
import { SongsService } from './songs.service.js';

/** Cuantas canciones se archivan por pasada, para no bloquear el proceso. */
const BATCH = 100;

/**
 * Cada madrugada archiva las canciones que no se usan hace `ARCHIVE_AFTER_MONTHS`
 * meses. No borra nada: conserva la letra y el enlace de YouTube, y solo libera
 * la pista subida (la limpieza de multimedia borra el archivo despues).
 */
@Injectable()
export class SongsArchiveService {
  private readonly logger = new Logger(SongsArchiveService.name);

  constructor(
    private readonly repository: SongsRepository,
    private readonly songs: SongsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'songs-archive' })
  async run(): Promise<void> {
    try {
      const before = new Date();
      before.setMonth(before.getMonth() - ARCHIVE_AFTER_MONTHS);
      const stale = await this.repository.findStale(before, BATCH);
      for (const song of stale) {
        await this.songs.archiveStale(song.churchId, song.id);
      }
      if (stale.length > 0) {
        this.logger.log(
          `Canciones archivadas por falta de uso: ${stale.length}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Falló el archivado de canciones',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
