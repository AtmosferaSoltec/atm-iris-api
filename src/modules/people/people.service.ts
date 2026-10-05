import { ConflictException, Injectable } from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import { idConflict, notFound } from '../../common/exceptions/api-errors.js';
import { byName, nameKey } from '../../shared/utils/text.js';
import type { CreatePersonInput } from './dto/people.schema.js';
import { toPerson } from './people.mapper.js';
import { PeopleRepository } from './people.repository.js';
import type { Person } from './people.types.js';

export type CreatedPerson = { person: Person; isNew: boolean };

@Injectable()
export class PeopleService {
  constructor(private readonly repository: PeopleRepository) {}

  async list(churchId: string): Promise<Person[]> {
    const rows = await this.repository.listActive(churchId);
    const counts = await this.repository.countBlocks(
      churchId,
      rows.map((row) => row.id),
    );

    return rows
      .map((row) => toPerson(row, counts.get(row.id) ?? 0))
      .sort(byName((person) => person.name));
  }

  /**
   * Idempotente por `id` (contrato §2): si la consola reintenta desde su cola
   * con el mismo id, devuelve la persona que ya creo en lugar de duplicarla.
   */
  create(churchId: string, input: CreatePersonInput): Promise<CreatedPerson> {
    return this.repository.withLock(churchId, async (tx) => {
      if (input.id) {
        const existing = await this.repository.findAnyById(input.id, tx);
        if (existing) {
          if (existing.churchId !== churchId) throw idConflict();
          return { person: await this.withCount(churchId, existing), isNew: false };
        }
      }

      const key = nameKey(input.name);
      if (await this.repository.isNameTaken(churchId, key, null, tx)) {
        throw nameTaken();
      }

      const row = await this.repository.create(
        churchId,
        { id: input.id, name: input.name, nameKey: key },
        tx,
      );
      return { person: toPerson(row), isNew: true };
    });
  }

  rename(churchId: string, id: string, name: string): Promise<Person> {
    return this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw personNotFound();

      const key = nameKey(name);
      if (await this.repository.isNameTaken(churchId, key, id, tx)) {
        throw nameTaken();
      }

      const row = await this.repository.rename(churchId, id, { name, nameKey: key }, tx);
      return this.withCount(churchId, row);
    });
  }

  async remove(churchId: string, id: string): Promise<void> {
    await this.repository.withLock(churchId, async (tx) => {
      const current = await this.repository.findActive(churchId, id, tx);
      if (!current) throw personNotFound();

      await this.repository.softDelete(churchId, id, tx);
    });
  }

  private async withCount(
    churchId: string,
    row: Parameters<typeof toPerson>[0],
  ): Promise<Person> {
    const counts = await this.repository.countBlocks(churchId, [row.id]);
    return toPerson(row, counts.get(row.id) ?? 0);
  }
}

const nameTaken = () =>
  new ConflictException({
    code: API_ERROR_CODES.PERSON_NAME_TAKEN,
    message: 'Ya existe una persona con ese nombre.',
    errors: { name: 'Ya existe una persona con ese nombre.' },
  });

const personNotFound = () => notFound('Esa persona no existe.');
