const MB = 1024 * 1024;

/**
 * Lo que debe cumplir un medio para ser fondo de las letras (contrato §11).
 * La web tiene la misma tabla en `src/domain/media-rules.ts`; si cambias un
 * valor, cambialo en los dos.
 *
 * Cualquier tamaño y proporcion: el fondo llena la pantalla recortando lo que
 * sobra (como `object-fit: cover`). Lo unico que se limita es el peso y, en un
 * video, la duracion: se repite en bucle y sin sonido, asi que con 30 s basta.
 */
export const BACKGROUND_RULES = {
  image: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 15 * MB,
  },
  video: {
    contentTypes: ['video/mp4', 'video/quicktime'],
    maxBytes: 200 * MB,
    maxSeconds: 30,
  },
} as const;

/** Un video de "30 s" suele medir 30,03 s: medio segundo de margen. */
const SECONDS_TOLERANCE = 0.5;

type Candidate = {
  kind: 'image' | 'video' | 'audio';
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

/** El motivo por el que no sirve de fondo, o null si sirve. */
export function backgroundProblem(media: Candidate): string | null {
  if (media.kind === 'audio')
    return 'Un audio no puede ser fondo. Usa una imagen o un video.';
  const rules = BACKGROUND_RULES[media.kind];

  if (!(rules.contentTypes as readonly string[]).includes(media.contentType)) {
    return media.kind === 'video'
      ? 'El video de fondo debe ser MP4 o MOV.'
      : 'La imagen de fondo debe ser JPG, PNG o WebP.';
  }
  if (media.sizeBytes > rules.maxBytes) {
    return `El archivo pesa demasiado para un fondo. El máximo es ${rules.maxBytes / MB} MB.`;
  }
  if (media.kind === 'video') {
    if (media.durationSeconds === null) {
      return 'No pudimos medir el video. Prueba con otro.';
    }
    const { maxSeconds } = BACKGROUND_RULES.video;
    if (media.durationSeconds > maxSeconds + SECONDS_TOLERANCE) {
      return `El video de fondo dura como máximo ${maxSeconds} segundos: se repite en bucle.`;
    }
  }
  return null;
}
