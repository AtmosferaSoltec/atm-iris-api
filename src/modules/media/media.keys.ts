/**
 * `churches/<churchId>/media/<id>/<nombre>`. El nombre se sanea (sin acentos ni
 * simbolos) solo para que la clave sea legible en la consola del bucket; el
 * nombre original se guarda aparte y es el que ve el usuario al descargar.
 */
export function objectKeyFor(churchId: string, id: string, fileName: string): string {
  const safe =
    fileName
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|-+$/g, '')
      .slice(0, 150) || 'archivo';
  return `churches/${churchId}/media/${id}/${safe}`;
}
