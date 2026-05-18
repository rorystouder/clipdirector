import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: 'forks',
    forks: { singleFork: true },
  },
});
