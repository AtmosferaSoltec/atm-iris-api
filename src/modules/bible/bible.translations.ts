/**
 * Traducciones que el script de importacion sabe cargar. Agregar una aqui no
 * la publica: solo existe en la base cuando se importa su archivo.
 */
export type BibleTranslationInfo = {
  code: string;
  name: string;
  language: string;
};

export const BIBLE_TRANSLATIONS: readonly BibleTranslationInfo[] = [
  { code: 'rvr1909', name: 'Reina-Valera 1909', language: 'es' },
  { code: 'rvr1960', name: 'Reina-Valera 1960', language: 'es' },
  { code: 'nvi', name: 'Nueva Versión Internacional', language: 'es' },
  { code: 'ntv', name: 'Nueva Traducción Viviente', language: 'es' },
];
