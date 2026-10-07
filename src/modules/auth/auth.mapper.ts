import type { ClientPlatform } from '../../generated/prisma/client.js';
import type { ClientPlatformName } from './auth.types.js';

/**
 * Traduccion entre el enum de la base (MAYUSCULAS) y el del contrato
 * (minusculas). Un solo lugar, para que ningun modulo invente la suya.
 */
const PLATFORM_TO_DB: Record<ClientPlatformName, ClientPlatform> = {
  web: 'WEB',
  ios: 'IOS',
  windows: 'WINDOWS',
};

export const toPlatform = (platform: ClientPlatform): ClientPlatformName =>
  platform.toLowerCase() as ClientPlatformName;

export const toDbPlatform = (platform: ClientPlatformName): ClientPlatform =>
  PLATFORM_TO_DB[platform];
