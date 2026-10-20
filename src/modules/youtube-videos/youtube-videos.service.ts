import { Injectable } from '@nestjs/common';

import { idConflict, notFound } from '../../common/exceptions/api-errors.js';
import { PlanItemKind } from '../../generated/prisma/client.js';
import { ServicePlanRepository } from '../service-plan/service-plan.repository.js';
import type { CreateYoutubeVideoInput } from './dto/youtube-videos.schema.js';
import { toYoutubeVideo } from './youtube-videos.mapper.js';
import { YoutubeVideosRepository } from './youtube-videos.repository.js';
import type { YoutubeVideo } from './youtube-videos.types.js';

export type SavedYoutubeVideo = { video: YoutubeVideo; isNew: boolean };

@Injectable()
export class YoutubeVideosService {
  constructor(
    private readonly repository: YoutubeVideosRepository,
    private readonly servicePlan: ServicePlanRepository,
  ) {}

  async list(churchId: string): Promise<YoutubeVideo[]> {
    const rows = await this.repository.listActive(churchId);
    return rows.map(toYoutubeVideo);
  }

  async get(churchId: string, id: string): Promise<YoutubeVideo> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw videoNotFound();
    return toYoutubeVideo(row);
  }

  /**
   * Idempotente por `id` y por video: guardar dos veces el mismo video de YouTube
   * devuelve el que ya estaba (200) en lugar de duplicarlo.
   */
  create(
    churchId: string,
    input: CreateYoutubeVideoInput,
  ): Promise<SavedYoutubeVideo> {
    return this.repository.withLock(churchId, async (tx) => {
      if (input.id) {
        const existing = await this.repository.findAnyById(input.id, tx);
        if (existing) {
          if (existing.churchId !== churchId) throw idConflict();
          return { video: toYoutubeVideo(existing), isNew: false };
        }
      }

      const same = await this.repository.findActiveByVideoId(
        churchId,
        input.videoId,
        tx,
      );
      if (same) return { video: toYoutubeVideo(same), isNew: false };

      const row = await this.repository.create(
        churchId,
        {
          id: input.id,
          videoId: input.videoId,
          title: input.title,
          author: input.author,
        },
        tx,
      );
      return { video: toYoutubeVideo(row), isNew: true };
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw videoNotFound();
      await this.repository.softDelete(churchId, id, tx);
      // Sin esto, el plan adelantado quedaria con una referencia colgando.
      await this.servicePlan.softDeleteByRef(
        churchId,
        PlanItemKind.YOUTUBE,
        id,
        tx,
      );
    });
  }
}

const videoNotFound = () => notFound('Ese video ya no está en la biblioteca.');
