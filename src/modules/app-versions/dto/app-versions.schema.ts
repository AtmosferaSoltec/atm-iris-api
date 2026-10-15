import { z } from 'zod';

/** Numeros separados por puntos: "1.0", "1.0.1", "2.3.4.5". */
export const VERSION_PATTERN = /^\d{1,5}(\.\d{1,5}){1,3}$/;

export const appVersionQuerySchema = z.object({
  platform: z.enum(['ios', 'windows'], 'La plataforma debe ser "ios" o "windows".'),
  version: z
    .string('Indica la version de la app.')
    .trim()
    .regex(VERSION_PATTERN, 'La version debe verse como 1.0.1.'),
});

export type AppVersionQuery = z.infer<typeof appVersionQuerySchema>;
