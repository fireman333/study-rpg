import { defineConfig } from 'vitest/config'

// Mirrors apps/neurons-tw/vitest.config.ts. Plain node environment: the units
// under test here are pure request-body parsing, so they need neither the
// workers runtime (workers-pool) nor miniflare — anything that DOES need a real
// R2Bucket / JWKS fetch belongs in an integration test, not this project.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
})
