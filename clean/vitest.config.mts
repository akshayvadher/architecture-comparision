import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.module.ts',
        'src/**/main.ts',
        'src/infrastructure/**',
        'src/interface-adapters/**',
        'src/**/*.dto.ts',
        'src/**/*.input.ts',
        'src/**/*.output.ts',
      ],
      // baseline: will be tightened in a follow-up
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 85,
      },
    },
  },
  plugins: [swc.vite()],
});
