import { z } from 'zod';

export const claimDisplaySchema = z.object({
  code: z
    .string('Escribe el código que muestra el televisor.')
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'El código tiene 6 letras y números.'),
  name: z
    .string('Ponle un nombre al televisor.')
    .trim()
    .min(1, 'Ponle un nombre al televisor.')
    .max(60, 'El nombre tiene como máximo 60 caracteres.'),
});

/**
 * Lo que la consola manda a sus televisores. El API no interpreta el cuadro ni
 * la lista de archivos (los define cada cliente, §18): solo los reenvia y
 * guarda el ultimo para el televisor que se conecte despues.
 */
export const displayStateSchema = z
  .object({
    frame: z.record(z.string(), z.unknown()).optional(),
    preload: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
    /** `Date.now()` de la consola al mandarlo: el televisor corrige su reloj con esto. */
    clock: z.number().int().positive(),
    /** El televisor que proyecta: solo él recibe esto. Sin él, todos los televisores. */
    displayId: z.uuid('El id del televisor debe ser un UUID.').optional(),
  })
  .refine((state) => state.frame || state.preload, {
    message: 'Manda el cuadro o la lista de archivos.',
  });

export type ClaimDisplayInput = z.infer<typeof claimDisplaySchema>;
export type DisplayStateInput = z.infer<typeof displayStateSchema>;
