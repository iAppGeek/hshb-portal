import path from 'path'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '.netlify/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.spec.{ts,tsx}', 'src/styles/**', 'src/types/**'],
      thresholds: {
        lines: 75,
        branches: 68,
        functions: 65,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a marker package whose main entry does nothing but
      // throw; its exports map only serves the empty build under the
      // `react-server` condition, which tests do not run with. Resolving it
      // here saves every spec that touches a server module from mocking it.
      'server-only': path.resolve(
        __dirname,
        './node_modules/server-only/empty.js',
      ),
    },
  },
})
