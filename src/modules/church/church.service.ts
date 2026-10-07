import { Injectable, NotFoundException } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { SystemFeaturesService } from '../system-features/system-features.service.js';
import { toChurch } from './church.mapper.js';
import { ChurchRepository } from './church.repository.js';
import type { Church } from './church.types.js';
import type {
  ChurchModulesInput,
  UpdateChurchInput,
  UpdateProjectionInput,
} from './dto/church.schema.js';

@Injectable()
export class ChurchService {
  constructor(
    private readonly repository: ChurchRepository,
    private readonly features: SystemFeaturesService,
  ) {}

  async get(churchId: string): Promise<Church> {
    const [church, usedBytes, available] = await Promise.all([
      this.repository.findChurch(churchId),
      this.repository.usedStorageBytes(churchId),
      this.features.availableModules(),
    ]);
    if (!church) {
      throw new NotFoundException({
        code: API_ERROR_CODES.NOT_FOUND,
        message: 'No encontramos la iglesia.',
      });
    }
    return toChurch(church, usedBytes, available);
  }

  async update(churchId: string, input: UpdateChurchInput): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });
    return this.get(churchId);
  }

  /**
   * Un modulo apagado para todo Iris no se toca: la iglesia ni lo ve, y su
   * eleccion guardada vuelve tal cual cuando se habilite otra vez.
   */
  async setModules(churchId: string, input: ChurchModulesInput): Promise<Church> {
    const available = await this.features.availableModules();
    await this.repository.updateChurch(churchId, {
      ...(available.bible ? { bibleEnabled: input.bible } : {}),
      ...(available.multimedia ? { multimediaEnabled: input.multimedia } : {}),
      ...(available.timeControl ? { timeControlEnabled: input.timeControl } : {}),
    });
    return this.get(churchId);
  }

  async setProjection(churchId: string, input: UpdateProjectionInput): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      projectionFontFamily: input.fontFamily,
      projectionFontSizePt: input.fontSizePt,
      projectionDefaultBackground: input.defaultBackgroundId,
    });
    return this.get(churchId);
  }
}
