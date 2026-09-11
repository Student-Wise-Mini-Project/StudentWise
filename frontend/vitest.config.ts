import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      // Pin the API origin so tests never depend on jsdom's ambient
      // `location.origin` -- which is http://localhost:3000, where a real dev
      // server can and does answer, quietly replacing a mocked response with a
      // page of HTML.
      VITE_API_URL: 'http://api.test',
    },
  },
})
