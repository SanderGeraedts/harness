import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { seedDemoData } from './config'
import { db } from './db/db'
import { router } from './router'
import { seedIfEmpty } from './seed/demo'
import { registerServiceWorker } from './sw/register'
import './styles/app.css'

async function start() {
  // G-0019: everything but production starts with demo data.
  if (seedDemoData) await seedIfEmpty(db)
  // Changes that haven't synced exist only on this device; ask the browser to keep them.
  void navigator.storage?.persist?.()
  // The sync engine starts here once it exists (src/sync/README.md).
  registerServiceWorker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
