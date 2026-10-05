import { z } from 'zod';

import { createPaginationSchema } from '../../../common/dto/pagination.schema.js';

const seconds = (message: string) =>
  z.number(message).int('Los segundos deben ser un número entero.').min(0, message);

const instant = (message: string) =>
  z.iso.datetime({ offset: true, message }).transform((value) => new Date(value));

const blockRecordSchema = z.object({
  id: z.uuid('El id del bloque debe ser un UUID.'),
  name: z
    .string('Escribe el nombre del bloque.')
    .trim()
    .min(1, 'Escribe el nombre del bloque.')
    .max(60, 'El nombre del bloque tiene como máximo 60 caracteres.'),
  plannedSeconds: seconds('El tiempo previsto debe ser 0 o más segundos.'),
  actualSeconds: seconds('El tiempo real debe ser 0 o más segundos.'),
  personId: z.string().min(1).max(64).nullable(),
  personName: z
    .string()
    .trim()
    .max(80, 'El nombre tiene como máximo 80 caracteres.')
    .nullable()
    .transform((value) => (value ? value : null)),
  status: z.enum(['completed', 'skipped'], 'El estado debe ser completed o skipped.'),
});

export const serviceRecordInputSchema = z.object({
  date: instant('La fecha debe ser un instante ISO-8601.'),
  serviceTypeId: z.string('Indica el tipo de servicio.').min(1).max(64),
  serviceTypeName: z
    .string('Indica el nombre del servicio.')
    .trim()
    .min(1, 'Indica el nombre del servicio.')
    .max(60, 'El nombre del servicio tiene como máximo 60 caracteres.'),
  blocks: z
    .array(blockRecordSchema, 'Indica los bloques.')
    .min(1, 'Un registro tiene al menos un bloque.')
    .max(60, 'Un registro tiene como máximo 60 bloques.')
    .superRefine((blocks, ctx) => {
      const seen = new Set<string>();
      blocks.forEach((block, index) => {
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

export const recordIdSchema = z.uuid('El id del registro debe ser un UUID.');

export const updateBlockRecordSchema = z
  .object({
    actualSeconds: seconds('El tiempo real debe ser 0 o más segundos.').optional(),
    personId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((data) => data.actualSeconds !== undefined || data.personId !== undefined, {
    message: 'No hay nada que cambiar.',
  });

export const listServiceRecordsSchema = createPaginationSchema({ maxLimit: 500 })
  .extend({
    from: instant('`from` debe ser un instante ISO-8601.').optional(),
    to: instant('`to` debe ser un instante ISO-8601.').optional(),
    serviceTypeId: z.string().min(1).max(64).optional(),
  });

export type ServiceRecordInput = z.infer<typeof serviceRecordInputSchema>;
export type UpdateBlockRecordInput = z.infer<typeof updateBlockRecordSchema>;
export type ListServiceRecordsQuery = z.infer<typeof listServiceRecordsSchema>;
