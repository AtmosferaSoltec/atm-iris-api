/**
 * Las tipografias que se ofrecen para la letra proyectada (contrato §6). Son
 * claves, no nombres de fuente. Salvo `system`, son fuentes web libres (Google
 * Fonts, licencia OFL) que cada cliente incluye consigo: asi la letra se ve
 * igual en la computadora, en el televisor y en el iPad, sin depender de las
 * fuentes que traiga cada aparato. Agregar una es agregar una fila aqui y la
 * fuente en cada cliente.
 */
export const PROJECTION_FONTS = [
  // clave              // fuente              // estilo
  'system', //           la del sistema         sans, la de siempre
  'inter', //            Inter                  sans moderna, muy legible
  'montserrat', //       Montserrat             sans geometrica
  'poppins', //          Poppins                sans redonda
  'oswald', //           Oswald                 sans angosta, entra mas texto
  'bebasNeue', //        Bebas Neue             titulos, solo mayusculas
  'playfairDisplay', //  Playfair Display       serif elegante
  'lora', //             Lora                   serif para leer
  'merriweather', //     Merriweather           serif robusta
] as const;

export type ProjectionFont = (typeof PROJECTION_FONTS)[number];

export const DEFAULT_PROJECTION_FONT: ProjectionFont = 'system';
export const DEFAULT_PROJECTION_FONT_SIZE_PT = 100;
export const PROJECTION_FONT_SIZE_PT = { min: 100, max: 250 } as const;
