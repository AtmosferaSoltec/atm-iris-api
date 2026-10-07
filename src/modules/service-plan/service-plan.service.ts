import { Injectable } from '@nestjs/common';

import {
  idConflict,
  notFound,
  validationFailed,
} from '../../common/exceptions/api-errors.js';
import { MediaRepository } from '../media/media.repository.js';
import { SongsRepository } from '../songs/songs.repository.js';
import type {
  CreateServicePlanItemInput,
  MoveServicePlanItemInput,
} from './dto/service-plan.schema.js';
import { toPlanItemKind, toServicePlanItem } from './service-plan.mapper.js';
import { ServicePlanRepository } from './service-plan.repository.js';
import type { ServicePlanItem } from './service-plan.types.js';

export type SavedServicePlanItem = { item: ServicePlanItem; isNew: boolean };

/**
 * Lo adelantado desde la web para el proximo servicio (contrato §15): sin
 * historial, el mismo contenido para cualquier cliente que abra a continuacion.
 */
@Injectable()
export class ServicePlanService {
  constructor(
    private readonly repository: ServicePlanRepository,
    private readonly songs: SongsRepository,
    private readonly media: MediaRepository,
  ) {}

  async list(churchId: string): Promise<ServicePlanItem[]> {
    const rows = await this.repository.listActive(churchId);
    return rows.map(toServicePlanItem);
  }

  /** Idempotente por `id`: un reintento devuelve el mismo elemento (200). */
  add(
    churchId: string,
    input: CreateServicePlanItemInput,
  ): Promise<SavedServicePlanItem> {
    return this.repository.withLock(churchId, async (tx) => {
      if (input.id) {
        const existing = await this.repository.findAnyById(input.id, tx);
        if (existing) {
          if (existing.churchId !== churchId) throw idConflict();
          return { item: toServicePlanItem(existing), isNew: false };
        }
      }

      await this.assertRefExists(churchId, input.kind, input.refId, tx);

      const position = await this.repository.nextPosition(churchId, tx);
      const row = await this.repository.create(
        churchId,
        input.id,
        toPlanItemKind(input.kind),
        input.refId,
        position,
        tx,
      );
      return { item: toServicePlanItem(row), isNew: true };
    });
  }

  async move(
    churchId: string,
    id: string,
    input: MoveServicePlanItemInput,
  ): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw itemNotFound();
      await this.repository.move(churchId, id, input.position, tx);
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw itemNotFound();
      await this.repository.softDelete(churchId, id, tx);
    });
  }

  async clear(churchId: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      await this.repository.clearActive(churchId, tx);
    });
  }

  private async assertRefExists(
    churchId: string,
    kind: CreateServicePlanItemInput['kind'],
    refId: string,
    tx: Parameters<ServicePlanRepository['nextPosition']>[1],
  ): Promise<void> {
    const exists =
      kind === 'song'
        ? await this.songs.findActive(churchId, refId, tx)
        : await this.media.findActive(churchId, refId, tx);
    if (!exists) {
      throw validationFailed({
        refId:
          kind === 'song' ? 'Esa canción no existe.' : 'Ese medio no existe.',
      });
    }
  }
}

const itemNotFound = () => notFound('Ese elemento ya no está en el plan.');
