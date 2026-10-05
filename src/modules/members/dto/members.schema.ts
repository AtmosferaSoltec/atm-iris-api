import { z } from 'zod';

import {
  clientSchema,
  email,
} from '../../auth/dto/auth.schema.js';

const role = z.enum(
  ['owner', 'admin', 'operator'],
  'Elige un rol: dueño, administrador u operador.',
);

export const updateMemberSchema = z.object({ role });

export const createInvitationSchema = z.object({ email, role });

export const invitationLookupSchema = z.object({
  token: z.string('Falta el token de la invitación.').trim().min(1).max(100),
});

/**
 * Un solo esquema para los dos casos del contrato: con cuenta nueva llega
 * `fullName` y una contrasena nueva; con cuenta existente, solo la contrasena
 * de esa cuenta. Cual aplica lo decide el servicio, que sabe si el correo ya
 * tiene usuario.
 */
export const acceptInvitationSchema = z.object({
  token: z.string('Falta el token de la invitación.').trim().min(1).max(100),
  fullName: z
    .string()
    .trim()
    .min(1, 'Escribe tu nombre.')
    .max(120, 'Usa un nombre más corto.')
    .optional(),
  password: z
    .string('Escribe tu contraseña.')
    .min(1, 'Escribe tu contraseña.')
    .max(128, 'Usa como máximo 128 caracteres.'),
  client: clientSchema,
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
