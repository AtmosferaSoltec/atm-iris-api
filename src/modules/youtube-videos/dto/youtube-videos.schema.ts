import { z } from 'zod';

export const createYoutubeVideoSchema = z.object({
  /** Generado por la consola para reintentar sin duplicar (contrato §2). */
  id: z.uuid('El id debe ser un UUID.').optional(),
  videoId: z
    .string('Indica el video de YouTube.')
    .trim()
    .regex(/^[\w-]{11}$/, 'Ese no es un video de YouTube.'),
  title: z
    .string('Indica el título del video.')
    .trim()
    .min(1, 'Indica el título del video.')
    .max(200, 'Usa un título de 200 caracteres o menos.'),
  author: z
    .string('El autor debe ser texto.')
    .trim()
    .max(200, 'Usa un autor de 200 caracteres o menos.')
    .default(''),
});

export type CreateYoutubeVideoInput = z.infer<typeof createYoutubeVideoSchema>;
