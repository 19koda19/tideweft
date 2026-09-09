import { defineConfig } from 'vitest/config';

const LOCAL_TEST_TIMEOUT_MS = 15_000;
const CI_TEST_TIMEOUT_MS = 90_000;

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    // Regional generation and sealed save/cargo integration are deliberately
    // heavyweight. Keep local feedback tight, while allowing the serialized
    // release gate enough wall time on materially slower shared runners.
    testTimeout: process.env.CI === 'true'
      ? CI_TEST_TIMEOUT_MS
      : LOCAL_TEST_TIMEOUT_MS,
  },
});
