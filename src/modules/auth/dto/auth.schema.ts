import { z } from 'zod';

/** Minusculas y sin espacios: el correo es la identidad y se compara exacto. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Ingresa el correo de tu iglesia.')
  .max(254, 'Ese correo es demasiado largo.')
  .pipe(z.email('Ese correo no parece válido.'));

export const newPassword = z
  .string('Escribe una contraseña.')
  .min(8, 'Usa al menos 8 caracteres.')
  .max(128, 'Usa como máximo 128 caracteres.');

const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código tiene 6 dígitos.');

/** Quien abre la sesion. Las consolas mandan un nombre para reconocerla luego. */
export const clientSchema = z.object({
  platform: z.enum(
    ['web', 'ios', 'windows'],
    'Indica desde dónde se inicia sesión.',
  ),
  deviceName: z.string().trim().max(80).optional(),
});

export const signUpSchema = z.object({
  churchName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre de tu iglesia.')
    .max(120, 'Usa un nombre más corto.'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del responsable.')
    .max(120, 'Usa un nombre más corto.'),
  email,
  password: newPassword,
  client: clientSchema,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Ingresa tu contraseña.').max(128),
  client: clientSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});

export const forgotPasswordSchema = z.object({ email });

export const verifyResetCodeSchema = z.object({ email, code });

export const resetPasswordSchema = verifyResetCodeSchema
  .extend({
    password: newPassword,
    passwordConfirmation: z.string().min(1, 'Repite la contraseña.'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Las contraseñas no coinciden.',
  });

export const updateProfileSchema = z.object({
  fullName: z
    .string('Escribe tu nombre.')
    .trim()
    .min(1, 'Escribe tu nombre.')
    .max(120, 'Usa un nombre más corto.'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string('Ingresa tu contraseña actual.')
      .min(1, 'Ingresa tu contraseña actual.')
      .max(128),
    password: newPassword,
    passwordConfirmation: z.string('Repite la contraseña.').min(1, 'Repite la contraseña.'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'Las contraseñas no coinciden.',
  });

export const switchChurchSchema = z.object({
  churchId: z.string('Indica la iglesia.').trim().min(1, 'Indica la iglesia.').max(64),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SwitchChurchInput = z.infer<typeof switchChurchSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
