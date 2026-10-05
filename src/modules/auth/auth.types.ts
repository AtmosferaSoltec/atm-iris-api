/** Rol de una persona dentro de una iglesia. Viaja en minusculas. */
export type ChurchRole = 'owner' | 'member';

export type ClientPlatformName = 'web' | 'ios' | 'windows';

/** Lo que viaja firmado dentro del access token. */
export type AccessTokenPayload = {
  /** Id del usuario. */
  sub: string;
  churchId: string;
  /** Id de la sesion: el guard comprueba que siga viva. */
  sid: string;
  role: ChurchRole;
  /** Distingue el access token de cualquier otro JWT firmado con el secreto. */
  typ: 'access';
};

/** La sesion como la ve el resto de la aplicacion. */
export type AuthenticatedUser = {
  userId: string;
  churchId: string;
  sessionId: string;
  role: ChurchRole;
};

/** Datos del dispositivo y la red, para nombrar y rastrear la sesion. */
export type RequestOrigin = {
  ipAddress?: string;
  userAgent?: string;
};

/** Respuesta de `GET /auth/me`. */
export type SessionView = {
  user: { id: string; email: string; fullName: string };
  church: { id: string; name: string };
  role: ChurchRole;
  session: {
    id: string;
    platform: ClientPlatformName;
    deviceName: string | null;
  };
};

/** Respuesta de sign-up, sign-in y refresh. */
export type AuthResult = SessionView & {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};
