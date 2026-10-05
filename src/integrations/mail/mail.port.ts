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

/** Invitacion a una iglesia, con el enlace de aceptacion. */
export type InvitationMail = {
  to: string;
  churchName: string;
  invitedByName: string;
  /** "Dueño", "Administrador" u "Operador". */
  roleLabel: string;
  acceptUrl: string;
  /** Fecha de vencimiento ya escrita en espanol y en la zona de la iglesia. */
  expiresOn: string;
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

  abstract sendInvitation(input: InvitationMail): Promise<void>;
}
