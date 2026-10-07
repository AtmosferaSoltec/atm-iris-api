/** Contrato §6. Letras siempre esta activo, por eso no aparece. */
export type ChurchModules = {
  bible: boolean;
  multimedia: boolean;
  timeControl: boolean;
};

/** Contrato §6. Tamano en puntos, referido a una pantalla de 1920 de ancho. */
export type ProjectionSettings = {
  fontFamily: string;
  fontSizePt: number;
  /** Un degradado o una imagen de la biblioteca; "negro" si no hay ninguno. */
  defaultBackgroundId: string | null;
};

/** Contrato §6. Las tres partes de `breakdown` suman `usedBytes`. */
export type StorageUsage = {
  usedBytes: number;
  quotaBytes: number;
  breakdown: StorageBreakdown;
};

/** Musica = audios; fondos = imagenes o videos marcados como fondo; multimedia = el resto. */
export type StorageBreakdown = {
  musicBytes: number;
  backgroundBytes: number;
  mediaBytes: number;
};

export type Church = {
  id: string;
  name: string;
  timezone: string;
  /** Lo que la iglesia ve encendido: su eleccion, salvo lo apagado para todo Iris. */
  modules: ChurchModules;
  /** Modulos que existen hoy en Iris (`system_features`). Lo que no, no se ofrece ni en ajustes. */
  availableModules: ChurchModules;
  /** Como se ve la letra proyectada; igual para todas las consolas de la iglesia. */
  projection: ProjectionSettings;
  storage: StorageUsage;
  createdAt: string;
  updatedAt: string;
};
