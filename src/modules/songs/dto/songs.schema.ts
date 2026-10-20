import { z } from 'zod';

import { createPaginationSchema } from '../../../common/dto/pagination.schema.js';

/** Vacio o solo espacios cuenta como "sin valor". */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const sectionSchema = z.object({
  label: optionalText(40, 'La etiqueta tiene como máximo 40 caracteres.'),
  // Solo se recortan los extremos: los saltos de linea internos son la letra.
  text: z
    .string('Escribe el texto de la sección.')
    .trim()
    .min(1, 'La sección no puede estar vacía.')
    .max(2000, 'La sección tiene como máximo 2000 caracteres.'),
});

const songFields = z.object({
  title: z
    .string('Escribe el título.')
    .trim()
    .min(1, 'Escribe el título.')
    .max(120, 'El título tiene como máximo 120 caracteres.'),
  author: z
    .string('El autor debe ser texto.')
    .trim()
    .max(120, 'El autor tiene como máximo 120 caracteres.')
    .default(''),
  // Vacio si la cancion es solo pista; `hasLyricsOrTrack` exige letra o pista.
  sections: z
    .array(sectionSchema, 'Las secciones deben ser una lista.')
    .max(80, 'Una canción tiene como máximo 80 secciones.')
    .default([]),
  audioId: z
    .uuid('La pista debe ser un id de multimedia.')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  youtubeMusic: z.boolean('youtubeMusic debe ser true o false.').default(false),
  youtubeId: z
    .string('La pista de YouTube debe ser texto.')
    .regex(/^[\w-]{11}$/, 'Ese no es un video de YouTube.')
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

/**
 * Una cancion tiene letra, pista o ambas; nunca ninguna. La pista es un audio
 * subido o un video de YouTube, no los dos.
 */
const hasLyricsOrTrack = (
  song: {
    sections: unknown[];
    audioId: string | null;
    youtubeId: string | null;
  },
  ctx: z.RefinementCtx,
) => {
  if (song.audioId !== null && song.youtubeId !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['youtubeId'],
      message: 'La pista es un audio o un video de YouTube, no los dos.',
    });
  }
  if (
    song.sections.length === 0 &&
    song.audioId === null &&
    song.youtubeId === null
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['sections'],
      message: 'Agrega la letra o una pista.',
    });
  }
};

export const songInputSchema = songFields.superRefine(hasLyricsOrTrack);

export const createSongSchema = songFields
  .extend({ id: z.uuid('El id debe ser un UUID.').optional() })
  .superRefine(hasLyricsOrTrack);

export const listSongsSchema = createPaginationSchema().extend({
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['title', '-updatedAt'], 'Orden inválido.').optional(),
});

export type SongInput = z.infer<typeof songInputSchema>;
export type CreateSongInput = z.infer<typeof createSongSchema>;
export type ListSongsQuery = z.infer<typeof listSongsSchema>;
