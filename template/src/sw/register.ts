import { registerSW } from 'virtual:pwa-register'

// The service worker precaches the app shell, so the app opens offline. With registerType
// 'autoUpdate' (vite.config.ts) a new version takes over as soon as it is downloaded.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({ immediate: true })
}
