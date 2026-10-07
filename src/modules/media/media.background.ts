const MB = 1024 * 1024;

/**
 * Lo que debe cumplir un medio para ser fondo de las letras (contrato §11).
 * La web tiene la misma tabla en `src/domain/media-rules.ts`; si cambias un
 * valor, cambialo en los dos.
 *
 * - Imagen: 16:9, de 1280x720 a 3840x2160; se recomienda 1920x1080.
 * - Video: solo MP4, 16:9, de 1280x720 a 1920x1080, hasta 30 s: se repite en
 *   bucle y sin sonido, asi que lo corto pesa poco y el corte no se nota.
 */
export const BACKGROUND_RULES = {
  image: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * MB,
    minWidth: 1280,
    maxWidth: 3840,
  },
  video: {
    contentTypes: ['video/mp4'],
    maxBytes: 100 * MB,
    minWidth: 1280,
    maxWidth: 1920,
    maxSeconds: 30,
  },
  /** 16:9 con un 2 % de margen (1366x768 y similares pasan). */
  aspectRatio: 16 / 9,
  aspectTolerance: 0.02,
} as const;

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
      ? 'El video de fondo debe ser MP4.'
      : 'La imagen de fondo debe ser JPG, PNG o WebP.';
  }
  if (media.sizeBytes > rules.maxBytes) {
    return `El archivo pesa demasiado para un fondo. El máximo es ${rules.maxBytes / MB} MB.`;
  }
  if (!media.width || !media.height) {
    return 'No pudimos medir el archivo. Prueba con otro.';
  }
  const ratio = media.width / media.height;
  if (
    Math.abs(ratio / BACKGROUND_RULES.aspectRatio - 1) >
    BACKGROUND_RULES.aspectTolerance
  ) {
    return 'El fondo debe ser horizontal 16:9, por ejemplo 1920 × 1080.';
  }
  if (media.width < rules.minWidth || media.width > rules.maxWidth) {
    return `El fondo debe medir entre ${rules.minWidth} × ${Math.round(rules.minWidth / BACKGROUND_RULES.aspectRatio)} y ${rules.maxWidth} × ${Math.round(rules.maxWidth / BACKGROUND_RULES.aspectRatio)} (recomendado 1920 × 1080).`;
  }
  if (
    media.kind === 'video' &&
    (media.durationSeconds ?? Infinity) > BACKGROUND_RULES.video.maxSeconds
  ) {
    return `El video de fondo dura como máximo ${BACKGROUND_RULES.video.maxSeconds} segundos: se repite en bucle.`;
  }
  return null;
}
