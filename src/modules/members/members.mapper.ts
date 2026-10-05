import { toRole } from '../auth/auth.mapper.js';
import type { Invitation as InvitationRow } from '../../generated/prisma/client.js';
import type { Invitation, Member } from './members.types.js';
import type { MemberWithUser } from './members.repository.js';

export function toMember(row: MemberWithUser, currentUserId: string): Member {
  return {
    id: row.id,
    user: { id: row.user.id, email: row.user.email, fullName: row.user.fullName },
    role: toRole(row.role),
    joinedAt: row.createdAt.toISOString(),
    isCurrentUser: row.userId === currentUserId,
  };
}

export function toInvitation(
  row: InvitationRow & { invitedBy: { id: string; fullName: string } },
): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: toRole(row.role),
    invitedBy: { id: row.invitedBy.id, fullName: row.invitedBy.fullName },
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
