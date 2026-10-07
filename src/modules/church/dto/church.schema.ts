import { z } from 'zod';

import {
  PROJECTION_FONT_SIZE_PT,
  PROJECTION_FONTS,
} from '../projection-fonts.js';

/**
 * Zonas IANA que entiende el runtime. `UTC` se agrega a mano: algunas versiones
 * de ICU no la incluyen en la lista aunque `Intl` la acepte.
 */
const TIME_ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

export const updateChurchSchema = z
  .object({
    name: z
      .string('Escribe el nombre de la iglesia.')
      .trim()
      .min(1, 'Escribe el nombre de la iglesia.')
      .max(120, 'Usa un nombre más corto.')
      .optional(),
    timezone: z
      .string('Elige una zona horaria.')
      .refine((zone) => TIME_ZONES.has(zone), 'Esa zona horaria no existe.')
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.timezone !== undefined, {
    message: 'No hay nada que cambiar.',
  });

export const churchModulesSchema = z.object({
  bible: z.boolean('Indica si la Biblia está activa.'),
  multimedia: z.boolean('Indica si Multimedia está activo.'),
  timeControl: z.boolean('Indica si Control de tiempo está activo.'),
});

/** Vacio o solo espacios cuenta como "ninguno": vuelve a negro. */
const defaultBackgroundId = z
  .string()
  .trim()
  .max(64, 'Ese id es demasiado largo.')
  .nullable()
  .optional()
  .transform((value) => (value ? value : null));

export const updateProjectionSchema = z.object({
  fontFamily: z.enum(PROJECTION_FONTS, 'Esa tipografía no existe.'),
  fontSizePt: z
    .number('Indica el tamaño en puntos.')
    .int('El tamaño debe ser un número entero.')
    .min(PROJECTION_FONT_SIZE_PT.min, `El tamaño mínimo es ${PROJECTION_FONT_SIZE_PT.min}.`)
    .max(PROJECTION_FONT_SIZE_PT.max, `El tamaño máximo es ${PROJECTION_FONT_SIZE_PT.max}.`),
  defaultBackgroundId,
});

export type UpdateChurchInput = z.infer<typeof updateChurchSchema>;
export type ChurchModulesInput = z.infer<typeof churchModulesSchema>;
export type UpdateProjectionInput = z.infer<typeof updateProjectionSchema>;
