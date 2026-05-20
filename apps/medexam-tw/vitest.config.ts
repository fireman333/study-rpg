import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    // Engine retry loop sleeps up to 250+1000+4000=5250 ms before exhausting.
    // Tests run in real time (fake timers are tricky with multi-await retry
    // loops); 15 s gives headroom without being misleadingly slow.
    testTimeout: 15_000,
  },
})
