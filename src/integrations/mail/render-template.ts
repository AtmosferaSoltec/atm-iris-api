/**
 * Reemplazo de marcadores `{{clave}}` en las plantillas ya compiladas.
 *
 * No es un motor de plantillas y no debe convertirse en uno: si una plantilla
 * necesita condicionales o bucles, eso se resuelve en el `.mjml`, no aqui.
 */

/**
 * Escapa lo que va dentro del HTML.
 *
 * Hace falta porque los valores vienen de la base de datos: un usuario llamado
 * `Ana <script>` romperia el correo, y un `&` suelto —que en nombres de empresa
 * es normal— ya se ve mal en algunos clientes.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Sustituye cada `{{clave}}` por su valor, ya escapado.
 *
 * Revienta si queda algun marcador sin reemplazar. Es a proposito: es mejor
 * fallar en el envio —queda en el log y el usuario reintenta— que mandar un
 * correo donde el codigo se lee literalmente `{{code}}`.
 */
export function renderTemplate(
  html: string,
  values: Record<string, string | number>,
): string {
  const rendered = html.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key];

    return value === undefined ? match : escapeHtml(String(value));
  });

  const pending = rendered.match(/\{\{\w+\}\}/g);

  if (pending) {
    throw new Error(
      `La plantilla dejo marcadores sin valor: ${[...new Set(pending)].join(', ')}`,
    );
  }

  return rendered;
}
