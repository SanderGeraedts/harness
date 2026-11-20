/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The host sets CONTEXT to production, deploy-preview or branch-deploy. Anything else
// (local dev, local builds, CI) is "local".
const deployContext = process.env.CONTEXT ?? 'local'

// G-0019: only a production build may know the backend's address. Outside production it is
// never read, so it can't end up in a preview, dev or test bundle.
const backendUrl = deployContext === 'production' ? (process.env.BACKEND_URL ?? '') : ''

export default defineConfig({
  define: {
    __DEPLOY_CONTEXT__: JSON.stringify(deployContext),
    __BACKEND_URL__: JSON.stringify(backendUrl),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: __PROJECT_TITLE_JSON__,
        short_name: __PROJECT_TITLE_JSON__,
        description: __PROJECT_PURPOSE_JSON__,
        lang: '__LANGUAGE__',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1c1c1e',
        theme_color: '#1c1c1e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
