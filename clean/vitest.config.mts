import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
  },
  plugins: [swc.vite()],
});
