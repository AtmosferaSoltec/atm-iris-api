/**
 * Forma con la que se comparan nombres de personas, tipos de servicio y titulos
 * de canciones (contrato §2): recortada, espacios internos colapsados, sin
 * diacriticos y en minusculas. `"  José   Pérez "` → `"jose perez"`.
 *
 * Se calcula aqui y se guarda en columnas `name_key` / `search_text` en lugar
 * de usar `unaccent` en la base: asi la regla es una sola, en TypeScript, y los
 * clientes la replican igual.
 */
export function nameKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es');
}

/** Texto de busqueda: el `nameKey` de todas las partes unidas por espacio. */
export function searchText(...parts: (string | null | undefined)[]): string {
  return nameKey(parts.filter(Boolean).join(' '));
}

/**
 * La base usa collation `C` (orden por bytes): "Álamo" quedaria despues de
 * "Zarza". Las listas por nombre se ordenan en memoria con esto.
 */
export const spanishCollator = new Intl.Collator('es', { sensitivity: 'base' });

export const byName = <T>(name: (item: T) => string) => (a: T, b: T) =>
  spanishCollator.compare(name(a), name(b));
