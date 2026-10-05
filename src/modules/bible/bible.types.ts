/** Contrato §13. */
export type BibleTranslation = {
  code: string;
  name: string;
  language: 'es';
  version: number;
  sizeBytes: number;
};

export type BibleBook = {
  /** Codigo USFM: "GEN", "PSA", "JHN", "REV". */
  id: string;
  name: string;
  testament: 'old' | 'new';
  chapterCount: number;
  /** 1-66. */
  position: number;
};

export type BibleChapter = {
  bookId: string;
  chapter: number;
  verses: { number: number; text: string }[];
};

export type BibleDownload = {
  code: string;
  name: string;
  version: number;
  /** `chapters[c][v]` = texto del versiculo c+1:v+1. */
  books: (BibleBook & { chapters: string[][] })[];
};
