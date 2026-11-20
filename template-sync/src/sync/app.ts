import { useSyncExternalStore } from 'react'
import type { Auth, AuthState } from '../auth/auth'
import type { SyncEngine, SyncStatus } from './engine'

// What the screens know about sync. In a build that syncs (production, with a backend
// address) `main.tsx` loads ./start.ts and registers what it made here. In every other build
// nothing is registered: the hooks answer null, and no screen shows a sign-in or reaches a
// network (G-0019). Only types are taken from the engine here, so the backend's client stays
// out of every build that doesn't sync.

export interface SyncApp {
  auth: Auth
  engine: SyncEngine
}

let app: SyncApp | null = null

/** Called once, before the first render. */
export function registerSyncApp(started: SyncApp): void {
  app = started
}

export const syncApp = (): SyncApp | null => app

const never = () => () => {}
const nothing = () => null

/** The sign-in's state, live. null in a build that doesn't sync. */
export function useAuthState(): AuthState | null {
  return useSyncExternalStore(app ? app.auth.subscribe : never, app ? app.auth.state : nothing)
}

/** The engine's status, live. null in a build that doesn't sync. */
export function useSyncStatus(): SyncStatus | null {
  return useSyncExternalStore(app ? app.engine.subscribe : never, app ? app.engine.getStatus : nothing)
}

// --- Whether the browser protects what is stored here ---

let storageProtected: boolean | null = null
const storageListeners = new Set<() => void>()

/** The browser's answer to the request for persistent storage (main.tsx). */
export function setStorageProtected(answer: boolean): void {
  storageProtected = answer
  for (const listener of [...storageListeners]) listener()
}

/** true or false once the browser answered; null while unknown, and in browsers without the request. */
export function useStorageProtected(): boolean | null {
  return useSyncExternalStore(
    (listener) => {
      storageListeners.add(listener)
      return () => void storageListeners.delete(listener)
    },
    () => storageProtected,
  )
}

// --- Whether the device says it is online ---

function onConnection(listener: () => void): () => void {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** What the device says; it can be wrong, so nothing is refused on it. */
export function useOnline(): boolean {
  return useSyncExternalStore(onConnection, () => navigator.onLine)
}
