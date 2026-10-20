/**
 * Un pasaje como lo guarda el plan (contrato §15): la traduccion, el libro
 * (USFM), el capitulo y los versiculos, dentro de un mismo capitulo.
 * `rvr1909:JHN.3.16` es un versiculo; `rvr1909:JHN.3.16-18`, tres. Lleva la
 * traduccion para que el dia que haya otra el plan siga diciendo cual era.
 */
export type Passage = {
  code: string;
  bookId: string;
  chapter: number;
  from: number;
  to: number;
};

const PATTERN =
  /^([a-z0-9]{2,20}):([A-Z0-9]{3})\.(\d{1,3})\.(\d{1,3})(?:-(\d{1,3}))?$/;

export function parsePassage(ref: string): Passage | null {
  const match = PATTERN.exec(ref);
  if (!match) return null;
  const [, code, bookId, chapter, from, to = from] = match;
  const passage = {
    code: code!,
    bookId: bookId!,
    chapter: Number(chapter),
    from: Number(from),
    to: Number(to),
  };
  if (passage.chapter < 1 || passage.from < 1 || passage.to < passage.from) {
    return null;
  }
  return passage;
}

export function formatPassage({
  code,
  bookId,
  chapter,
  from,
  to,
}: Passage): string {
  return `${code}:${bookId}.${chapter}.${from}${to > from ? `-${to}` : ''}`;
}
