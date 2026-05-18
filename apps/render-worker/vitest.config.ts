import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
