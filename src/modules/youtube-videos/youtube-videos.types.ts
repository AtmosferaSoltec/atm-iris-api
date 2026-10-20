/** Contrato §12b: un video de YouTube guardado en la biblioteca (solo el enlace, nada se descarga). */
export type YoutubeVideo = {
  id: string;
  /** Los 11 caracteres del video en YouTube. */
  videoId: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};
