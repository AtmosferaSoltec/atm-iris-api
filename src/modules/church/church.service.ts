import { Injectable, NotFoundException } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { toChurch } from './church.mapper.js';
import { ChurchRepository } from './church.repository.js';
import type { Church } from './church.types.js';
import type {
  UpdateChurchInput,
  UpdateProjectionInput,
} from './dto/church.schema.js';

@Injectable()
export class ChurchService {
  constructor(private readonly repository: ChurchRepository) {}

  async get(churchId: string): Promise<Church> {
    const [church, usage] = await Promise.all([
      this.repository.findChurch(churchId),
      this.repository.storageBreakdown(churchId),
    ]);
    if (!church) {
      throw new NotFoundException({
        code: API_ERROR_CODES.NOT_FOUND,
        message: 'No encontramos la iglesia.',
      });
    }
    return toChurch(church, usage);
  }

  async update(churchId: string, input: UpdateChurchInput): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });
    return this.get(churchId);
  }

  async setProjection(
    churchId: string,
    input: UpdateProjectionInput,
  ): Promise<Church> {
    await this.repository.updateChurch(churchId, {
      projectionFontFamily: input.fontFamily,
      projectionFontSizePt: input.fontSizePt,
      projectionFontBold: input.fontBold,
      projectionFontItalic: input.fontItalic,
      projectionUppercase: input.uppercase,
      projectionDefaultBackground: input.defaultBackgroundId,
    });
    return this.get(churchId);
  }
}
