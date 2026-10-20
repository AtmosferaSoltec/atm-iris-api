/** Contrato §18. */
export type Display = {
  id: string;
  name: string;
  /** Tiene el canal abierto ahora mismo. */
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

/** Lo que el televisor recibe al pedir un codigo. */
export type DisplayPairing = {
  id: string;
  code: string;
  /** Solo el televisor que pidio el codigo lo conoce: con el pregunta si ya lo vincularon. */
  secret: string;
  expiresAt: string;
};

export type PairingStatus =
  | { status: 'pending' }
  | { status: 'paired'; token: string; display: { id: string; name: string } };
