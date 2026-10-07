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
  it('acepta una imagen 1920x1080 y un video MP4 de 20 s', () => {
    expect(backgroundProblem(image)).toBeNull();
    expect(backgroundProblem(video)).toBeNull();
  });

  it('rechaza audio, tipos no permitidos y archivos pesados', () => {
    expect(backgroundProblem({ ...image, kind: 'audio' })).toMatch(/audio/i);
    expect(
      backgroundProblem({ ...video, contentType: 'video/quicktime' }),
    ).toMatch(/MP4/);
    expect(
      backgroundProblem({ ...image, sizeBytes: 11 * 1024 * 1024 }),
    ).toMatch(/10 MB/);
    expect(
      backgroundProblem({ ...video, sizeBytes: 101 * 1024 * 1024 }),
    ).toMatch(/100 MB/);
  });

  it('exige 16:9 y un tamaño dentro del rango', () => {
    expect(backgroundProblem({ ...image, width: 1080, height: 1080 })).toMatch(
      /16:9/,
    );
    expect(backgroundProblem({ ...image, width: 640, height: 360 })).toMatch(
      /entre 1280/,
    );
    expect(backgroundProblem({ ...video, width: 3840, height: 2160 })).toMatch(
      /entre 1280/,
    );
    expect(
      backgroundProblem({ ...image, width: 1366, height: 768 }),
    ).toBeNull();
    expect(backgroundProblem({ ...image, width: null, height: null })).toMatch(
      /medir/,
    );
  });

  it('limita el video a 30 segundos', () => {
    expect(backgroundProblem({ ...video, durationSeconds: 30 })).toBeNull();
    expect(backgroundProblem({ ...video, durationSeconds: 31 })).toMatch(
      /30 segundos/,
    );
    expect(backgroundProblem({ ...video, durationSeconds: null })).toMatch(
      /30 segundos/,
    );
  });
});
