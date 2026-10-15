export type AppPlatform = 'ios' | 'windows';

/** Respuesta de `GET /app-version` (contrato §17). */
export type AppVersionCheck = {
  platform: AppPlatform;
  /** La version publicada hoy para esa plataforma. */
  latestVersion: string;
  /** `true` cuando la app que pregunta es anterior a `latestVersion`: debe actualizarse para continuar. */
  updateRequired: boolean;
  /** A donde lleva el boton "Actualizar" (TestFlight o App Store en el iPad; en Windows la app se actualiza sola). */
  downloadUrl: string | null;
  /** Que trae la version, en una linea. */
  notes: string | null;
};
