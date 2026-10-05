import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { API_ERROR_CODES } from '../../common/constants/error-codes.js';
import type { MemberRole } from '../../generated/prisma/client.js';
import { byName } from '../../shared/utils/text.js';
import { toDbRole } from '../auth/auth.mapper.js';
import type { AuthenticatedUser, ChurchRole } from '../auth/auth.types.js';
import { toMember } from './members.mapper.js';
import { MembersRepository } from './members.repository.js';
import type { Member } from './members.types.js';

/**
 * Reglas del equipo (contrato §7):
 * - solo un `owner` asigna o quita el rol `owner`, y un `admin` no puede tocar a
 *   un `owner` (403);
 * - la iglesia nunca queda sin dueno activo (409 `LAST_OWNER`), tampoco cuando
 *   el ultimo dueno intenta degradarse o salir el mismo.
 */
@Injectable()
export class MembersService {
  constructor(private readonly repository: MembersRepository) {}

  async list(user: AuthenticatedUser): Promise<Member[]> {
    const rows = await this.repository.listActiveMembers(user.churchId);

    return rows
      .map((row) => toMember(row, user.userId))
      .sort(byName((member) => member.user.fullName));
  }

  updateRole(
    user: AuthenticatedUser,
    memberId: string,
    role: ChurchRole,
  ): Promise<Member> {
    const newRole = toDbRole(role);

    // Bajo el candado de la iglesia: dos duenos que se degradan a la vez no
    // pueden dejarla sin ninguno.
    return this.repository.withLock(user.churchId, async (tx) => {
      const target = await this.repository.findActiveMember(
        user.churchId,
        memberId,
        tx,
      );
      if (!target) throw notFound();

      assertCanManage(user, target.role, newRole);
      if (target.role === newRole) return toMember(target, user.userId);

      if (target.role === 'OWNER') {
        await this.assertNotLastOwner(user.churchId, tx);
      }

      const updated = await this.repository.updateRole(
        user.churchId,
        memberId,
        newRole,
        tx,
      );
      return toMember(updated, user.userId);
    });
  }

  async remove(user: AuthenticatedUser, memberId: string): Promise<void> {
    await this.repository.withLock(user.churchId, async (tx) => {
      const target = await this.repository.findActiveMember(
        user.churchId,
        memberId,
        tx,
      );
      if (!target) throw notFound();

      assertCanManage(user, target.role, target.role);
      if (target.role === 'OWNER') {
        await this.assertNotLastOwner(user.churchId, tx);
      }

      await this.repository.deactivateMember(
        user.churchId,
        memberId,
        target.userId,
        tx,
      );
    });
  }

  private async assertNotLastOwner(
    churchId: string,
    tx: Parameters<MembersRepository['countActiveOwners']>[1],
  ): Promise<void> {
    const owners = await this.repository.countActiveOwners(churchId, tx);
    if (owners <= 1) {
      throw new ConflictException({
        code: API_ERROR_CODES.LAST_OWNER,
        message:
          'La iglesia necesita al menos un dueño. Asigna otro dueño antes de hacer este cambio.',
      });
    }
  }
}

/**
 * Un `admin` no toca a un `owner` ni reparte el rol `owner`. Exportada porque
 * las invitaciones aplican la misma regla.
 */
export function assertCanManage(
  user: AuthenticatedUser,
  currentRole: MemberRole,
  nextRole: MemberRole,
): void {
  if (user.role === 'owner') return;
  if (currentRole === 'OWNER' || nextRole === 'OWNER') {
    throw new ForbiddenException({
      code: API_ERROR_CODES.FORBIDDEN,
      message: 'Solo un dueño puede asignar o modificar a otro dueño.',
    });
  }
}

const notFound = () =>
  new NotFoundException({
    code: API_ERROR_CODES.NOT_FOUND,
    message: 'Esa persona no forma parte del equipo.',
  });
