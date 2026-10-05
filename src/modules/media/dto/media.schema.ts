import { z } from 'zod';

import { createPaginationSchema } from '../../../common/dto/pagination.schema.js';

const kind = z.enum(['image', 'video', 'audio'], 'El tipo debe ser image, video o audio.');

const title = z
  .string('Escribe un título.')
  .trim()
  .min(1, 'Escribe un título.')
  .max(120, 'El título tiene como máximo 120 caracteres.');

const description = z
  .string()
  .trim()
  .max(500, 'La descripción tiene como máximo 500 caracteres.')
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

/** Medidas que toma el cliente. Se guardan en segundos y pixeles enteros. */
const measure = (message: string) =>
  z
    .number(message)
    .nonnegative(message)
    .nullable()
    .optional()
    .transform((value) => (value == null ? null : Math.round(value)));

export const createUploadSchema = z.object({
  kind,
  fileName: z
    .string('Indica el nombre del archivo.')
    .trim()
    .min(1, 'Indica el nombre del archivo.')
    .max(200, 'El nombre del archivo tiene como máximo 200 caracteres.'),
  // Sin parametros ("audio/mpeg; codecs=...") y en minusculas, para comparar
  // contra la tabla de tipos permitidos.
  contentType: z
    .string('Indica el tipo de archivo.')
    .trim()
    .min(1, 'Indica el tipo de archivo.')
    .max(100)
    .transform((value) => value.split(';')[0]!.trim().toLowerCase()),
  sizeBytes: z
    .number('Indica el tamaño del archivo.')
    .int('El tamaño debe ser un número entero de bytes.')
    .positive('El archivo está vacío.'),
});

export const confirmUploadSchema = z.object({
  uploadId: z.string('Falta el id de la subida.').trim().min(1).max(64),
  title,
  description,
  durationSeconds: measure('La duración debe ser un número positivo.'),
  width: measure('El ancho debe ser un número positivo.'),
  height: measure('El alto debe ser un número positivo.'),
  isBackground: z.boolean('Indica si es fondo.').optional().default(false),
});

/** En el PATCH, ausente (no tocar) no es lo mismo que `null` (borrar). */
const descriptionPatch = z
  .string()
  .trim()
  .max(500, 'La descripción tiene como máximo 500 caracteres.')
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null));

export const updateMediaSchema = z
  .object({
    title: title.optional(),
    description: descriptionPatch,
    isBackground: z.boolean('Indica si es fondo.').optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.isBackground !== undefined,
    { message: 'No hay nada que cambiar.' },
  );

export const listMediaSchema = createPaginationSchema().extend({
  kind: kind.optional(),
  search: z.string().trim().max(120).optional(),
  isBackground: z.stringbool({ error: 'isBackground debe ser true o false.' }).optional(),
});

export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
export type ListMediaQuery = z.infer<typeof listMediaSchema>;
