import type {
  ClientPlatform,
  MemberRole,
} from '../../generated/prisma/client.js';
import type { ChurchRole, ClientPlatformName } from './auth.types.js';

/**
 * Traducciones entre los enums de la base (MAYUSCULAS) y los del contrato
 * (minusculas). Un solo lugar, para que ningun modulo invente la suya.
 */
const ROLE_FROM_DB: Record<MemberRole, ChurchRole> = {
  OWNER: 'owner',
  ADMIN: 'admin',
  OPERATOR: 'operator',
};

const ROLE_TO_DB: Record<ChurchRole, MemberRole> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  operator: 'OPERATOR',
};

const PLATFORM_TO_DB: Record<ClientPlatformName, ClientPlatform> = {
  web: 'WEB',
  ios: 'IOS',
  windows: 'WINDOWS',
};

export const toRole = (role: MemberRole): ChurchRole => ROLE_FROM_DB[role];

export const toDbRole = (role: ChurchRole): MemberRole => ROLE_TO_DB[role];

export const toPlatform = (platform: ClientPlatform): ClientPlatformName =>
  platform.toLowerCase() as ClientPlatformName;

export const toDbPlatform = (platform: ClientPlatformName): ClientPlatform =>
  PLATFORM_TO_DB[platform];
