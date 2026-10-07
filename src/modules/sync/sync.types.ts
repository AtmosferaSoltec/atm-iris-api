import type { Church } from '../church/church.types.js';
import type { MediaAsset } from '../media/media.types.js';
import type { Person } from '../people/people.types.js';
import type { ServiceRecord } from '../service-records/service-records.types.js';
import type { ServicePlanItem } from '../service-plan/service-plan.types.js';
import type { ServiceType } from '../service-types/service-types.types.js';
import type { Song } from '../songs/songs.types.js';

/** Contrato §12. */
export type SyncPage = {
  /** Presente si la iglesia cambio despues de `since`. */
  church: Church | null;
  changes: {
    people: Person[];
    serviceTypes: ServiceType[];
    songs: Song[];
    media: MediaAsset[];
    serviceRecords: ServiceRecord[];
    servicePlan: ServicePlanItem[];
  };
  deleted: {
    people: string[];
    serviceTypes: string[];
    songs: string[];
    media: string[];
    serviceRecords: string[];
    servicePlan: string[];
  };
  /** Texto opaco para el cliente: la version mas alta entregada. */
  cursor: string;
  hasMore: boolean;
};

export type SyncEntityType = keyof SyncPage['changes'];

/** Una fila que cambio despues del cursor, sin cargar todavia. */
export type SyncCandidate = {
  type: SyncEntityType;
  id: string;
  version: bigint;
  isDeleted: boolean;
};
