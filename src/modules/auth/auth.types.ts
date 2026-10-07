export type ClientPlatformName = 'web' | 'ios' | 'windows';

/** Lo que viaja firmado dentro del access token. */
export type AccessTokenPayload = {
  /** Id del usuario. */
  sub: string;
  churchId: string;
  /** Id de la sesion: el guard comprueba que siga viva. */
  sid: string;
  /** Distingue el access token de cualquier otro JWT firmado con el secreto. */
  typ: 'access';
};

/** La sesion como la ve el resto de la aplicacion. */
export type AuthenticatedUser = {
  userId: string;
  churchId: string;
  sessionId: string;
};

/** Datos del dispositivo y la red, para nombrar y rastrear la sesion. */
export type RequestOrigin = {
  ipAddress?: string;
  userAgent?: string;
};

/** Respuesta de `GET /auth/me` (contrato §4). */
export type SessionView = {
  user: { id: string; email: string; fullName: string };
  church: { id: string; name: string; timezone: string };
  session: {
    id: string;
    platform: ClientPlatformName;
    deviceName: string | null;
  };
};

/** Un dispositivo con sesion abierta (`GET /auth/sessions`). */
export type DeviceSession = {
  id: string;
  platform: ClientPlatformName;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string;
  ipAddress: string | null;
  isCurrent: boolean;
};

/** Respuesta de sign-up, sign-in y refresh. */
export type AuthResult = SessionView & {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};
