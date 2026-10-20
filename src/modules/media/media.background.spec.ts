import { describe, expect, it } from 'vitest';

import { backgroundProblem } from './media.background.js';

const image = {
  kind: 'image' as const,
  contentType: 'image/png',
  sizeBytes: 2_000_000,
  width: 1920,
  height: 1080,
  durationSeconds: null,
};
const video = {
  kind: 'video' as const,
  contentType: 'video/mp4',
  sizeBytes: 20_000_000,
  width: 1920,
  height: 1080,
  durationSeconds: 20,
};

describe('backgroundProblem', () => {
  it('acepta cualquier tamaño y proporción: el fondo se recorta para llenar', () => {
    expect(backgroundProblem(image)).toBeNull();
    expect(backgroundProblem({ ...image, width: 640, height: 640 })).toBeNull();
    expect(
      backgroundProblem({ ...image, width: null, height: null }),
    ).toBeNull();
    expect(
      backgroundProblem({ ...video, width: 1080, height: 1920 }),
    ).toBeNull();
    expect(
      backgroundProblem({ ...video, width: 3840, height: 2160 }),
    ).toBeNull();
    expect(
      backgroundProblem({ ...video, contentType: 'video/quicktime' }),
    ).toBeNull();
  });

  it('rechaza audio, tipos no permitidos y archivos pesados', () => {
    expect(backgroundProblem({ ...image, kind: 'audio' })).toMatch(/audio/i);
    expect(backgroundProblem({ ...image, contentType: 'image/gif' })).toMatch(
      /JPG/,
    );
    expect(
      backgroundProblem({ ...image, sizeBytes: 16 * 1024 * 1024 }),
    ).toMatch(/15 MB/);
    expect(
      backgroundProblem({ ...video, sizeBytes: 201 * 1024 * 1024 }),
    ).toMatch(/200 MB/);
  });

  it('limita el video a 30 segundos (con medio segundo de margen)', () => {
    expect(backgroundProblem({ ...video, durationSeconds: 30.03 })).toBeNull();
    expect(backgroundProblem({ ...video, durationSeconds: 31 })).toMatch(/30/);
    expect(backgroundProblem({ ...video, durationSeconds: null })).toMatch(
      /medir/,
    );
  });
});
