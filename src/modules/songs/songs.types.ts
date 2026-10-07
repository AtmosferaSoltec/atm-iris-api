/** Contrato §10. */
export type SongSection = { id: string; label: string | null; text: string };

export type Song = {
  id: string;
  title: string;
  author: string;
  sections: SongSection[];
  createdAt: string;
  updatedAt: string;
};

export type SongSummary = {
  id: string;
  title: string;
  author: string;
  sectionCount: number;
  firstLine: string | null;
  updatedAt: string;
};
