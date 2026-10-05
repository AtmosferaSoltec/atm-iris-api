import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    // La aplicacion comparte una base de datos: correr los archivos en
    // paralelo hace que un test borre los datos que otro esta usando.
    fileParallelism: false,
    // Cada archivo en su propio proceso, para que uno pueda ajustar el entorno
    // (el limite de peticiones) sin contaminar a los demas.
    pool: 'forks',
    isolate: true,
  },
});
