import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/lint/**', 'src/deploy/**', 'src/schemas/**'],
      reporter: ['text', 'lcov'],
    },
  },
});
