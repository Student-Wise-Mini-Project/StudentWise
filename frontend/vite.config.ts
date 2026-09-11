import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The one unavoidable duplicate of a design token: the manifest is JSON, so it
// cannot read `src/styles/theme.css`. Keep these two in step by hand.
const THEME_COLOR = '#edefef' // --sw-ground, light
const BACKGROUND_COLOR = '#edefef' // the splash screen behind a cold start

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'StudentWise',
        short_name: 'StudentWise',
        description: 'Split expenses with the people you live, travel and eat with.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // The API is never a navigation target; without this an offline API call
        // resolves to the HTML shell and parses as JSON garbage.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Reads only. A write must never be served from a cache.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/') &&
              !/\/receipt$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reads',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // A replaced receipt reuses its URL, so CacheFirst would pin the old
            // image forever. Revalidate in the background instead.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/expenses\/[^/]+\/receipt$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-receipts',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin in development, so the service worker's /api rules and the
      // cookie-free Bearer setup behave exactly as they will in production.
      //
      // 127.0.0.1 rather than `localhost` on purpose. Node resolves `localhost`
      // to ::1 first, and uvicorn binds to 127.0.0.1 unless told otherwise -- so
      // the proxy connects to nothing and every /api call comes back 500 while
      // the backend is demonstrably up and answering on the same port.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
