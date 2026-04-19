import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/domain/**/*.ts'],
      exclude: [
        'src/**/*.module.ts',
        'src/**/main.ts',
        'src/infrastructure/**',
        'src/domain/events/**',
        'src/**/*.dto.ts',
      ],
      // baseline: will be tightened in a follow-up
      thresholds: {
        lines: 70,
        functions: 48,
        statements: 70,
        branches: 95,
      },
    },
  },
  plugins: [swc.vite()],
});
