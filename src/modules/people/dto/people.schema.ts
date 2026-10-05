import { z } from 'zod';

const name = z
  .string('Escribe el nombre.')
  .trim()
  .min(1, 'Escribe el nombre.')
  .max(80, 'Usa un nombre de 80 caracteres o menos.');

export const createPersonSchema = z.object({
  /** Generado por la consola para reintentar sin duplicar (contrato §2). */
  id: z.uuid('El id debe ser un UUID.').optional(),
  name,
});

export const updatePersonSchema = z.object({ name });

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
