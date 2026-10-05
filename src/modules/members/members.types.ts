import type { ChurchRole } from '../auth/auth.types.js';

/** Contrato §7. `id` es el de la membresia, no el del usuario. */
export type Member = {
  id: string;
  user: { id: string; email: string; fullName: string };
  role: ChurchRole;
  joinedAt: string;
  isCurrentUser: boolean;
};

export type Invitation = {
  id: string;
  email: string;
  role: ChurchRole;
  invitedBy: { id: string; fullName: string };
  expiresAt: string;
  createdAt: string;
};

export type InvitationPreview = {
  churchName: string;
  email: string;
  role: ChurchRole;
  invitedByName: string;
  expiresAt: string;
  hasAccount: boolean;
};
