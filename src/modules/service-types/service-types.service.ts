import { ConflictException, Injectable } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  idConflict,
  notFound,
} from '../../common/exceptions/api-errors.js';
import type { Tx } from '../../database/church-write-lock.js';
import { byName, nameKey } from '../../shared/utils/text.js';
import type {
  CreateServiceTypeInput,
  ServiceTypeInput,
} from './dto/service-types.schema.js';
import { toServiceType } from './service-types.mapper.js';
import { ServiceTypesRepository } from './service-types.repository.js';
import type { ServiceType } from './service-types.types.js';

export type SavedServiceType = { serviceType: ServiceType; isNew: boolean };

@Injectable()
export class ServiceTypesService {
  constructor(private readonly repository: ServiceTypesRepository) {}

  async list(churchId: string): Promise<ServiceType[]> {
    const rows = await this.repository.listActive(churchId);
    return rows.map(toServiceType).sort(byName((type) => type.name));
  }

  async get(churchId: string, id: string): Promise<ServiceType> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw serviceTypeNotFound();
    return toServiceType(row);
  }

  /**
   * `POST`: idempotente por `id`. Si ya existe en la iglesia se devuelve tal
   * cual (200); para reemplazarlo esta el `PUT`.
   */
  create(
    churchId: string,
    input: CreateServiceTypeInput,
  ): Promise<SavedServiceType> {
    return this.repository.withLock(churchId, async (tx) => {
      if (input.id) {
        const existing = await this.repository.findAnyById(input.id, tx);
        if (existing) {
          if (existing.churchId !== churchId) throw idConflict();
          return { serviceType: toServiceType(existing), isNew: false };
        }
      }

      const key = await this.validate(churchId, null, input, tx);
      const row = await this.repository.create(churchId, input.id, input, key, tx);
      return { serviceType: toServiceType(row!), isNew: true };
    });
  }

  /**
   * `PUT`: reemplazo completo, y crea si el id no existe (la consola guarda la
   * plantilla desde su cola sin saber si llego a crearse). Un tipo borrado no
   * revive: responde 404, como cualquier recurso borrado.
   */
  replace(
    churchId: string,
    id: string,
    input: ServiceTypeInput,
  ): Promise<SavedServiceType> {
    return this.repository.withLock(churchId, async (tx) => {
      const existing = await this.repository.findAnyById(id, tx);
      if (existing && existing.churchId !== churchId) throw idConflict();
      if (existing?.deletedAt) throw serviceTypeNotFound();

      const key = await this.validate(churchId, id, input, tx);

      if (!existing) {
        const row = await this.repository.create(churchId, id, input, key, tx);
        return { serviceType: toServiceType(row!), isNew: true };
      }

      const row = await this.repository.replace(churchId, id, input, key, tx);
      return { serviceType: toServiceType(row!), isNew: false };
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw serviceTypeNotFound();
      await this.repository.softDelete(churchId, id, tx);
    });
  }

  /**
   * Reglas que dependen de la base: nombre unico por nameKey, responsables que
   * existan en la iglesia y ids de bloque que no sean de otro tipo de servicio.
   * Devuelve el nameKey ya calculado.
   */
  private async validate(
    churchId: string,
    serviceTypeId: string | null,
    input: ServiceTypeInput,
    tx: Tx,
  ): Promise<string> {
    const key = nameKey(input.name);
    if (await this.repository.isNameTaken(churchId, key, serviceTypeId, tx)) {
      throw new ConflictException({
        code: API_ERROR_CODES.SERVICE_TYPE_NAME_TAKEN,
        message: 'Ya existe un servicio con ese nombre.',
        errors: { name: 'Ya existe un servicio con ese nombre.' },
      });
    }

    const blockIds = input.blocks.flatMap((b) => (b.id ? [b.id] : []));
    const owners = await this.repository.findBlockOwners(blockIds, tx);
    const foreign = new Set(
      owners.filter((o) => o.serviceTypeId !== serviceTypeId).map((o) => o.id),
    );
    const conflictIndex = input.blocks.findIndex((b) => b.id && foreign.has(b.id));
    if (conflictIndex >= 0) throw idConflict(`blocks.${conflictIndex}.id`);

    return key;
  }
}

const serviceTypeNotFound = () => notFound('Ese servicio no existe.');
