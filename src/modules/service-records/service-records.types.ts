/** Contrato §14. */
export type BlockStatusName = 'pending' | 'running' | 'completed' | 'skipped' | 'adjusted';

export type RecordStatusName = 'inProgress' | 'finished';

export type BlockRecord = {
  id: string;
  name: string;
  plannedSeconds: number;
  actualSeconds: number;
  personId: string | null;
  personName: string | null;
  status: BlockStatusName;
  startedAt: string | null;
  endedAt: string | null;
};

export type ServiceRecord = {
  id: string;
  /** `inProgress` mientras la consola lo lleva; se retoma si se cierra. */
  status: RecordStatusName;
  /** Inicio del primer bloque, UTC. */
  date: string;
  serviceTypeId: string;
  serviceTypeName: string;
  blocks: BlockRecord[];
  createdAt: string;
  updatedAt: string;
};
