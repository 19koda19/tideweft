import { defineConfig } from 'vitest/config';

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
    // heavyweight. Shared CI runners can take more than Vitest's 5 s default
    // without changing the deterministic result, so retain a finite but
    // host-tolerant wall-clock fence for every release gate.
    testTimeout: 15_000,
  },
});
