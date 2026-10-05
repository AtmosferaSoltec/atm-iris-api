/** Contrato §8. */
export type Person = {
  id: string;
  name: string;
  /** Bloques dirigidos en registros no borrados, sin contar los omitidos. */
  blockCount: number;
  createdAt: string;
  updatedAt: string;
};
