/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { headersFile } from './src/headers.ts'

// The host sets CONTEXT to production, deploy-preview or branch-deploy. Anything else
// (local dev, local builds, CI) is "local".
const deployContext = process.env.CONTEXT ?? 'local'

// G-0019: only a production build may know the backend's address. Outside production it is
// never read, so it can't end up in a preview, dev or test bundle.
const backendUrl = deployContext === 'production' ? (process.env.BACKEND_URL ?? '') : ''

// The host reads dist/_headers. It is written here and not kept in netlify.toml, because
// only a production build may name the backend's origin (connect-src), and the address is
// never in the repository.
function headers(): Plugin {
  return {
    name: 'headers-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(backendUrl) })
    },
  }
}

export default defineConfig({
  define: {
    __DEPLOY_CONTEXT__: JSON.stringify(deployContext),
    __BACKEND_URL__: JSON.stringify(backendUrl),
  },
  plugins: [
    react(),
    tailwindcss(),
    headers(),
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
