import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
          },
        ],
      },
      manifest: {
        name: 'Envíos App by Renace.tech',
        short_name: 'EnvíosApp',
        description: 'Gestión de envíos, mensajeros y rastreo en tiempo real',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ],
      },
    }),
  ],
  server: {
    port: 5185,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: { outDir: 'dist' },
});
