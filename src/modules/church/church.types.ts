/** Contrato §6. Letras siempre esta activo, por eso no aparece. */
export type ChurchModules = {
  bible: boolean;
  multimedia: boolean;
  timeControl: boolean;
};

export type Church = {
  id: string;
  name: string;
  timezone: string;
  modules: ChurchModules;
  storage: { usedBytes: number; quotaBytes: number };
  createdAt: string;
  updatedAt: string;
};
