import { z } from 'zod';

/** Una cancion del respaldo: la letra y los datos; los archivos no viajan. */
const backupSongSchema = z.object({
  title: z.string().trim().min(1).max(120),
  author: z.string().trim().max(120).default(''),
  sections: z
    .array(
      z.object({
        label: z.string().trim().max(40).nullable().optional(),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .max(80)
    .default([]),
  youtubeId: z
    .string()
    .regex(/^[\w-]{11}$/)
    .nullable()
    .optional(),
  youtubeMusic: z.boolean().default(false),
});

const backupYoutubeSchema = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).default(''),
});

export const BACKUP_FORMAT = 'iris-backup';

export const importBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, 'Ese archivo no es un respaldo de Iris.'),
  version: z.literal(1, 'Esa versión del respaldo no se reconoce.'),
  songs: z.array(backupSongSchema).max(2000).default([]),
  youtubeVideos: z.array(backupYoutubeSchema).max(2000).default([]),
});

export const eraseSchema = z
  .object({
    songs: z.boolean().default(false),
    media: z.boolean().default(false),
    youtube: z.boolean().default(false),
    /** Se escribe a mano en la consola para no borrar por accidente. */
    confirm: z.literal('ELIMINAR', 'Escribe ELIMINAR para confirmar.'),
  })
  .refine((value) => value.songs || value.media || value.youtube, {
    message: 'Elige qué eliminar.',
    path: ['songs'],
  });

export type ImportBackupInput = z.infer<typeof importBackupSchema>;
export type EraseInput = z.infer<typeof eraseSchema>;
