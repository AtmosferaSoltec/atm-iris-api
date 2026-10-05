import { z } from 'zod';

export const syncChangesSchema = z.object({
  since: z
    .string('Falta el cursor `since` ("0" la primera vez).')
    .regex(/^\d{1,19}$/, 'El cursor `since` no es válido.')
    .transform((value) => BigInt(value)),
  limit: z.coerce
    .number('El límite debe ser un número.')
    .int('El límite debe ser un número entero.')
    .min(1, 'El límite mínimo es 1.')
    .max(500, 'El límite máximo es 500.')
    .default(200),
});

export type SyncChangesQuery = z.infer<typeof syncChangesSchema>;
