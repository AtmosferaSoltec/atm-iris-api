/** Contrato §14. */
export type BlockStatusName = 'completed' | 'skipped' | 'adjusted';

export type BlockRecord = {
  id: string;
  name: string;
  plannedSeconds: number;
  actualSeconds: number;
  personId: string | null;
  personName: string | null;
  status: BlockStatusName;
};

export type ServiceRecord = {
  id: string;
  /** Inicio del primer bloque, UTC. */
  date: string;
  serviceTypeId: string;
  serviceTypeName: string;
  blocks: BlockRecord[];
  createdAt: string;
  updatedAt: string;
};
