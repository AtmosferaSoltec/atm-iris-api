import { Injectable, NotFoundException } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { toChurch } from './church.mapper.js';
import { ChurchRepository } from './church.repository.js';
import type { Church } from './church.types.js';
import type {
  ChurchModulesInput,
  UpdateChurchInput,
} from './dto/church.schema.js';

@Injectable()
export class ChurchService {
  constructor(private readonly repository: ChurchRepository) {}

  async get(churchId: string): Promise<Church> {
    const [church, usedBytes] = await Promise.all([
      this.repository.findChurch(churchId),
      this.repository.usedStorageBytes(churchId),
    ]);
    if (!church) {
      throw new NotFoundException({
        code: API_ERROR_CODES.NOT_FOUND,
        message: 'No encontramos la iglesia.',
      });
    }
    return toChurch(church, usedBytes);
  }

  async update(churchId: string, input: UpdateChurchInput): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });
    return this.get(churchId);
  }

  async setModules(churchId: string, input: ChurchModulesInput): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      bibleEnabled: input.bible,
      multimediaEnabled: input.multimedia,
      timeControlEnabled: input.timeControl,
    });
    return this.get(churchId);
  }
}
