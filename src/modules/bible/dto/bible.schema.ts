import { z } from 'zod';

export const chapterParamsSchema = z.object({
  code: z.string().max(20),
  bookId: z
    .string()
    .max(3)
    .transform((value) => value.toUpperCase()),
  chapter: z.coerce
    .number('El capítulo debe ser un número.')
    .int('El capítulo debe ser un número entero.')
    .min(1, 'El capítulo empieza en 1.')
    .max(200, 'Ese capítulo no existe.'),
});

export type ChapterParams = z.infer<typeof chapterParamsSchema>;
