import { z } from 'zod';

import { MAX_BLOCKS, SERVICE_TYPE_COLORS } from '../service-types.constants.js';

const scheduleSchema = z.object({
  weekday: z
    .number('Elige el día.')
    .int()
    .min(1, 'El día va de 1 (domingo) a 7 (sábado).')
    .max(7, 'El día va de 1 (domingo) a 7 (sábado).'),
  hour: z.number('Elige la hora.').int().min(0, 'Hora inválida.').max(23, 'Hora inválida.'),
  minute: z
    .number('Elige los minutos.')
    .int()
    .min(0, 'Minutos inválidos.')
    .max(59, 'Minutos inválidos.'),
});

const blockSchema = z.object({
  id: z.uuid('El id del bloque debe ser un UUID.').optional(),
  name: z
    .string('Escribe el nombre del bloque.')
    .trim()
    .min(1, 'Escribe el nombre del bloque.')
    .max(60, 'Usa un nombre de 60 caracteres o menos.'),
  plannedMinutes: z
    .number('Indica los minutos.')
    .int('Los minutos deben ser un número entero.')
    .min(1, 'El bloque dura al menos 1 minuto.')
    .max(240, 'El bloque dura como máximo 240 minutos.'),
});

export const serviceTypeInputSchema = z.object({
  name: z
    .string('Escribe el nombre del servicio.')
    .trim()
    .min(1, 'Escribe el nombre del servicio.')
    .max(60, 'Usa un nombre de 60 caracteres o menos.'),
  color: z.enum(SERVICE_TYPE_COLORS, 'Elige un color de la paleta.'),
  schedule: scheduleSchema.nullable(),
  blocks: z
    .array(blockSchema, 'Indica los bloques.')
    .max(MAX_BLOCKS, `Un servicio tiene como máximo ${MAX_BLOCKS} bloques.`)
    .superRefine((blocks, ctx) => {
      const seen = new Set<string>();
      blocks.forEach((block, index) => {
        if (!block.id) return;
        if (seen.has(block.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'id'],
            message: 'Hay dos bloques con el mismo id.',
          });
        }
        seen.add(block.id);
      });
    }),
});

export const createServiceTypeSchema = serviceTypeInputSchema.extend({
  id: z.uuid('El id debe ser un UUID.').optional(),
});

export type ServiceTypeInput = z.infer<typeof serviceTypeInputSchema>;
export type CreateServiceTypeInput = z.infer<typeof createServiceTypeSchema>;
