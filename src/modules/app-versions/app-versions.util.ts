/**
 * Compara versiones numericas separadas por puntos ("1.0.1", "1.2", "2.0.0.5").
 * Las partes que faltan valen 0, asi que "1.0" y "1.0.0" son la misma version.
 * Devuelve negativo si `a < b`, 0 si son iguales y positivo si `a > b`.
 */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parts(version: string): number[] {
  return version.split('.').map((part) => Number(part));
}
