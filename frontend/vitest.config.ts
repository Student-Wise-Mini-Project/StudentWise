import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    /**
     * happy-dom, not jsdom.
     *
     * jsdom installs its own `AbortController`, and once MSW patches the global
     * `Request`, `new Request(url, { signal })` fails its brand check with
     * "Expected signal to be an instance of AbortSignal". TanStack Query passes
     * a signal to every query function, so under jsdom *every* request through
     * the typed client threw before it was sent -- silently, because the query
     * just showed an error state.
     *
     * The alternative was to stop forwarding the signal, which would mean
     * dropping request cancellation from the real app to satisfy a test
     * environment. This works in a browser; the environment was the problem.
     */
    environment: 'happy-dom',
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
