import PocketBase, { LocalAuthStore } from 'pocketbase'
import { createAuth } from '../auth/auth'
import { db } from '../db/db'
import type { SyncApp } from './app'
import { createSyncEngine } from './engine'
import { KEYS } from './state'

// Makes the backend's client, the sign-in and the sync engine, and starts syncing.
// `main.tsx` loads this file only in a production build that was given a backend address
// (G-0019); it is the only file that imports the backend's client, so no other build
// carries it.

export function startSync(url: string): SyncApp {
  const client = new PocketBase(url, new LocalAuthStore(KEYS.token))
  // Sync makes its requests one after another on purpose; none may cancel another.
  client.autoCancellation(false)
  const auth = createAuth({ client, db, storage: localStorage, syncNow: () => engine.syncNow() })
  const engine = createSyncEngine({ db, client, auth, storage: localStorage })
  // Another tab signed in or out.
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === KEYS.account) auth.reload()
  })
  engine.start()
  return { auth, engine }
}
