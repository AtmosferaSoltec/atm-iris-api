import { z } from 'zod';

export const createServicePlanItemSchema = z.object({
  id: z.uuid('El id debe ser un UUID.').optional(),
  kind: z.enum(
    ['song', 'media', 'bible', 'youtube'],
    'El tipo debe ser "song", "media", "bible" o "youtube".',
  ),
  refId: z
    .string('Indica a que cancion, medio, pasaje o video se refiere.')
    .min(1)
    .max(64),
});

export const moveServicePlanItemSchema = z.object({
  position: z.number('La posicion debe ser un numero.').int().min(0),
});

export type CreateServicePlanItemInput = z.infer<
  typeof createServicePlanItemSchema
>;
export type MoveServicePlanItemInput = z.infer<
  typeof moveServicePlanItemSchema
>;
