/** Contrato §9. `weekday` 1 = domingo ... 7 = sabado, hora local de la iglesia. */
export type Schedule = { weekday: number; hour: number; minute: number };

export type BlockTemplate = {
  id: string;
  name: string;
  plannedMinutes: number;
};

export type ServiceType = {
  id: string;
  name: string;
  color: string;
  schedule: Schedule | null;
  /** Ya ordenados: el orden es el del servicio. */
  blocks: BlockTemplate[];
  createdAt: string;
  updatedAt: string;
};
