import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each test file gets its own isolated worker so DB state doesn't leak
    pool: 'forks',
    testTimeout: 30_000,
  },
});
