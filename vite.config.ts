import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { open: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
