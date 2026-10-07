/**
 * Las 10 tipografias que se ofrecen para la letra proyectada (contrato §6).
 * Son claves, no nombres de fuente: cada cliente las traduce a la fuente real
 * de su plataforma (ver la columna "iOS" / "Windows" aqui al lado). Agregar
 * una fuente es agregar una fila aqui y su traduccion en cada cliente.
 */
export const PROJECTION_FONTS = [
  // clave            // iOS (nombre real)      // Windows (equivalente sugerido)
  'system', //         SF Pro                    Segoe UI Variable   — recomendada
  'systemRounded', //  SF Pro Rounded            Segoe UI
  'serif', //          New York                  Georgia
  'georgia', //        Georgia                   Georgia
  'avenirNext', //     Avenir Next               Century Gothic
  'futura', //         Futura                    Bahnschrift
  'gillSans', //       Gill Sans                 Corbel
  'optima', //         Optima                    Candara
  'baskerville', //    Baskerville               Cambria
  'palatino', //       Palatino                  Palatino Linotype
] as const;

export type ProjectionFont = (typeof PROJECTION_FONTS)[number];

export const DEFAULT_PROJECTION_FONT: ProjectionFont = 'system';
export const DEFAULT_PROJECTION_FONT_SIZE_PT = 88;
export const PROJECTION_FONT_SIZE_PT = { min: 40, max: 200 } as const;
