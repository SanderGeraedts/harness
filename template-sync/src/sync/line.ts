import { t } from '../text'
import type { SyncError } from './engine'

// The one line of the sync status, and what its details show. Kept apart from the component
// so the rules can be read and tested by themselves.

/** Everything the sync status shows, gathered from the sign-in, the engine and the browser. */
export interface SyncView {
  /** The sign-in has ended (D-0009). */
  ended: boolean
  offline: boolean
  /** Rows in the outbox: changes the backend hasn't confirmed. */
  pending: number
  /** The browser answered no to the request for persistent storage. Not: unknown, or no such request. */
  storageRefused: boolean
  /** A sync is running. It doesn't change the line, only the "Sync now" button. */
  running: boolean
  lastSyncedAt: string | null
  /** The last sync's failure; null when it worked. */
  lastError: SyncError | null
  lastErrorAt: string | null
}

export type SyncRule = 'sign-in' | 'offline' | 'failed' | 'changes' | 'storage' | 'synced'

export interface SyncLine {
  /** The first rule that holds. */
  rule: SyncRule
  text: string
  /** What a screen reader hears when the rule changes: the line without its count. */
  announcement: string | null
}

export function syncLine(view: SyncView): SyncLine {
  const changes = view.pending > 0 ? t.syncChanges(view.pending) : null
  if (view.ended) {
    return { rule: 'sign-in', text: changes ? changes + t.joiner + t.syncSignInAgain : t.syncSignInAgain, announcement: t.syncSignInAgain }
  }
  if (view.offline) {
    return { rule: 'offline', text: changes ? t.syncOffline + t.joiner + changes : t.syncOfflineIdle, announcement: t.syncOffline }
  }
  if (view.lastError) {
    return { rule: 'failed', text: changes ? t.syncFailed + t.joiner + changes : t.syncFailed, announcement: t.syncFailed }
  }
  if (changes) return { rule: 'changes', text: changes, announcement: null }
  if (view.storageRefused) return { rule: 'storage', text: t.syncStorage, announcement: t.syncStorage }
  return { rule: 'synced', text: t.syncAllSynced, announcement: t.syncAllSynced }
}

/** The "Status" row of the details. */
export const syncSummary = (view: SyncView): string => (view.pending > 0 ? t.syncChanges(view.pending) : t.syncAllSynced)

/** The words for the last error; never a status code or a raw message. */
export const syncErrorText = (error: SyncError): string => (error === 'no-connection' ? t.syncErrorNoConnection : t.syncErrorOther)

/** A date and time in the page's language: medium date, short time. */
export function formatWhen(iso: string, language?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(language || undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
