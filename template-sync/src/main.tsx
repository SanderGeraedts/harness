import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { seedDemoData } from './config'
import { db } from './db/db'
import { router } from './router'
import { seedIfEmpty } from './seed/demo'
import { registerServiceWorker } from './sw/register'
import { registerSyncApp, setStorageProtected } from './sync/app'
import './styles/app.css'

async function start() {
  // G-0019: everything but production starts with demo data.
  if (seedDemoData) await seedIfEmpty(db)
  // Sync, and with it the sign-in, exists only in a production build that was given a
  // backend address (the same test as src/config.ts). Both constants are filled in at build
  // time, so every other build drops this branch, and with it the backend's client.
  if (__DEPLOY_CONTEXT__ === 'production' && __BACKEND_URL__ !== '') {
    const { startSync } = await import('./sync/start')
    registerSyncApp(startSync(__BACKEND_URL__))
  }
  // Changes that haven't synced exist only on this device; ask the browser to keep them.
  // The sync status says so when it answers no.
  void navigator.storage?.persist?.().then(setStorageProtected, () => {})
  registerServiceWorker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
