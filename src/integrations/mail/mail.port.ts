/** Datos del correo con el codigo de recuperacion. */
export type PasswordResetCodeMail = {
  to: string;
  fullName: string;
  code: string;
  expiresInMinutes: number;
};

/** Aviso de que la contrasena cambio. */
export type PasswordChangedMail = {
  to: string;
  fullName: string;
};

/**
 * Puerto de correo. `MailModule` elige la implementacion segun el entorno:
 * `ResendMailService` cuando hay credenciales y `ConsoleMailService` —que
 * escribe en el log— cuando se trabaja sin ellas.
 *
 * Quien llame debe asumir que el envio puede fallar: el proveedor esta del otro
 * lado de la red y los metodos lanzan si rechaza el correo.
 */
export abstract class MailPort {
  abstract sendPasswordResetCode(input: PasswordResetCodeMail): Promise<void>;

  abstract sendPasswordChanged(input: PasswordChangedMail): Promise<void>;
}
