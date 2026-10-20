import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { compareVersions } from './app-versions.util.js';
import type { AppPlatform, AppVersionCheck } from './app-versions.types.js';

/**
 * Version publicada de cada app (tabla `app_versions`, una fila por plataforma). Se cambia a mano en la base
 * (o con `pnpm db:set-app-version`) cuando la version nueva ya se puede descargar.
 */
@Injectable()
export class AppVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async check(
    platform: AppPlatform,
    version: string,
  ): Promise<AppVersionCheck> {
    const row = await this.prisma.appVersion.findUnique({
      where: { platform },
    });
    // Sin fila no hay nada publicado que exigir: la app sigue.
    if (!row) {
      return {
        platform,
        latestVersion: version,
        updateRequired: false,
        downloadUrl: null,
        notes: null,
      };
    }
    return {
      platform,
      latestVersion: row.version,
      updateRequired: compareVersions(version, row.version) < 0,
      downloadUrl: row.downloadUrl,
      notes: row.notes,
    };
  }
}
