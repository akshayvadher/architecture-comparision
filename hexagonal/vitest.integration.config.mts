import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
