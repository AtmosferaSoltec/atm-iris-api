import { z } from 'zod';

export const createServicePlanItemSchema = z.object({
  id: z.uuid('El id debe ser un UUID.').optional(),
  kind: z.enum(['song', 'media'], 'El tipo debe ser "song" o "media".'),
  refId: z.string('Indica a que cancion o medio se refiere.').min(1),
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
