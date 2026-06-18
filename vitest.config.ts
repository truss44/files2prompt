import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', '**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      './utils.js': '/src/utils.ts',
      './printing.js': '/src/printing.ts',
      './walker.js': '/src/walker.ts',
      './index.js': '/src/index.ts',
    },
  },
})
