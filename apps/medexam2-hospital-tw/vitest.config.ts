export default {
  root: new URL('.', import.meta.url).pathname,
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
}
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup-fake-indexeddb.ts'],
    testTimeout: 15_000,
  },
})
