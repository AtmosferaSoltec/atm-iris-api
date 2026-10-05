import { ForbiddenException, Injectable } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { hasPermission } from '../../common/constants/permissions.js';
import {
  pageWindow,
  paginate,
  type Paginated,
} from '../../common/dto/pagination.schema.js';
import {
  idConflict,
  notFound,
  validationFailed,
} from '../../common/exceptions/api-errors.js';
import type { Tx } from '../../database/church-write-lock.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type {
  ListServiceRecordsQuery,
  ServiceRecordInput,
  UpdateBlockRecordInput,
} from './dto/service-records.schema.js';
import {
  toServiceRecord,
  type ServiceRecordWithBlocks,
} from './service-records.mapper.js';
import { ServiceRecordsRepository } from './service-records.repository.js';
import type { ServiceRecord } from './service-records.types.js';

export type SavedRecord = { record: ServiceRecord; isNew: boolean };

@Injectable()
export class ServiceRecordsService {
  constructor(private readonly repository: ServiceRecordsRepository) {}

  async list(
    churchId: string,
    query: ListServiceRecordsQuery,
  ): Promise<Paginated<ServiceRecord>> {
    const filters = { from: query.from, to: query.to, serviceTypeId: query.serviceTypeId };
    const [rows, total] = await Promise.all([
      this.repository.list(churchId, filters, pageWindow(query)),
      this.repository.count(churchId, filters),
    ]);
    return paginate(rows.map(toServiceRecord), total, query.page, query.limit);
  }

  async get(churchId: string, id: string): Promise<ServiceRecord> {
    const row = await this.repository.findActive(churchId, id);
    if (!row) throw recordNotFound();
    return toServiceRecord(row);
  }

  /**
   * `PUT /service-records/:id`, el que usa la cola de la consola:
   * - no existe → lo crea (`records.write`, que ya exige el controlador), 201;
   * - existe con el mismo contenido → es un reintento: 200 sin tocar nada;
   * - existe con otro contenido → reemplazarlo es ajustar tiempos, pide
   *   `records.manage`, 200;
   * - existe en otra iglesia → 409 `ID_CONFLICT`.
   */
  save(
    user: AuthenticatedUser,
    id: string,
    input: ServiceRecordInput,
  ): Promise<SavedRecord> {
    return this.repository.withLock(user.churchId, async (tx) => {
      const existing = await this.repository.findAnyById(id, tx);
      if (existing && existing.churchId !== user.churchId) throw idConflict();
      if (existing?.deletedAt) throw recordNotFound();

      if (existing && isSameContent(existing, input)) {
        return { record: toServiceRecord(existing), isNew: false };
      }
      if (existing && !hasPermission(user.role, 'records.manage')) {
        throw new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          message: 'No tienes permiso para modificar un registro de tiempos ya guardado.',
        });
      }

      await this.validate(user.churchId, id, input, tx);

      if (!existing) {
        const row = await this.repository.create(user.churchId, id, input, user.sessionId, tx);
        return { record: toServiceRecord(row), isNew: true };
      }

      const row = await this.repository.replace(user.churchId, id, input, tx);
      return { record: toServiceRecord(row), isNew: false };
    });
  }

  /**
   * Ajuste desde la web: `actualSeconds` marca el bloque `adjusted`; `personId`
   * cambia el responsable y copia su nombre actual (o `null`).
   */
  updateBlock(
    churchId: string,
    recordId: string,
    blockId: string,
    input: UpdateBlockRecordInput,
  ): Promise<ServiceRecord> {
    return this.repository.withLock(churchId, async (tx) => {
      const record = await this.repository.findActive(churchId, recordId, tx);
      if (!record?.blocks.some((block) => block.id === blockId)) {
        throw notFound('Ese bloque no existe en el registro.');
      }

      let person: { personId: string | null; personName: string | null } | undefined;
      if (input.personId !== undefined) {
        if (input.personId === null) {
          person = { personId: null, personName: null };
        } else {
          const found = await this.repository.findActivePerson(churchId, input.personId, tx);
          if (!found) throw validationFailed({ personId: 'Esa persona no existe.' });
          person = { personId: input.personId, personName: found.name };
        }
      }

      const row = await this.repository.updateBlock(
        churchId,
        recordId,
        blockId,
        {
          ...(input.actualSeconds !== undefined
            ? { actualSeconds: input.actualSeconds, status: 'ADJUSTED' as const }
            : {}),
          ...person,
        },
        tx,
      );
      return toServiceRecord(row);
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw recordNotFound();
      await this.repository.softDelete(churchId, id, tx);
    });
  }

  private async validate(
    churchId: string,
    recordId: string,
    input: ServiceRecordInput,
    tx: Tx,
  ): Promise<void> {
    if (!(await this.repository.serviceTypeBelongs(churchId, input.serviceTypeId, tx))) {
      throw validationFailed({ serviceTypeId: 'Ese tipo de servicio no existe.' });
    }

    const owners = await this.repository.findBlockOwners(
      input.blocks.map((block) => block.id),
      tx,
    );
    const foreign = new Set(
      owners.filter((o) => o.serviceRecordId !== recordId).map((o) => o.id),
    );
    const index = input.blocks.findIndex((block) => foreign.has(block.id));
    if (index >= 0) throw idConflict(`blocks.${index}.id`);
  }
}

/**
 * Igualdad de contenido para reconocer un reintento. Un bloque ya ajustado
 * (`adjusted`) no es igual al `completed` que mando la consola: reenviarlo
 * desharia el ajuste, y para eso hace falta `records.manage`.
 */
export function isSameContent(row: ServiceRecordWithBlocks, input: ServiceRecordInput): boolean {
  const current = toServiceRecord(row);
  if (
    current.date !== input.date.toISOString() ||
    current.serviceTypeId !== input.serviceTypeId ||
    current.serviceTypeName !== input.serviceTypeName ||
    current.blocks.length !== input.blocks.length
  ) {
    return false;
  }

  return input.blocks.every((block, index) => {
    const saved = current.blocks[index]!;
    return (
      saved.id === block.id &&
      saved.name === block.name &&
      saved.plannedSeconds === block.plannedSeconds &&
      saved.actualSeconds === block.actualSeconds &&
      saved.personId === block.personId &&
      saved.personName === block.personName &&
      saved.status === block.status
    );
  });
}

const recordNotFound = () => notFound('Ese registro de tiempos no existe.');
