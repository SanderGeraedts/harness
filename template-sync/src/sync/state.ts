// What this device remembers about sync besides the records themselves: who signed in, the
// sign-in's token, how far the last pull got and when the last sync ended. It lives in the
// browser's localStorage, under this project's own keys, and goes with the rest of the
// device's data when the user signs out (D-0009).

/** The part of localStorage that is used; tests pass `memoryStorage()`. */
export interface KeyValue {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = '__PROJECT_NAME__:'

export const KEYS = {
  /** The account that owns what is on this device: `{ id, email }`. Set by a sign-in, removed only by a sign-out. */
  account: `${PREFIX}account`,
  /** The sign-in's token, as the backend's client keeps it. */
  token: `${PREFIX}auth`,
  /** The backend's `updated` of the last record a pull took in. */
  cursor: (table: string) => `${PREFIX}cursor:${table}`,
  /** The end of the last sync that sent and fetched everything. */
  lastSyncedAt: `${PREFIX}lastSyncedAt`,
  /** Changes when the device is cleared, so a sync that is still running stops writing. */
  epoch: `${PREFIX}epoch`,
} as const

/** The account that owns the data on this device. */
export interface Account {
  id: string
  email: string
}

export function readAccount(storage: KeyValue): Account | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEYS.account) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { id, email } = value as Record<string, unknown>
    return typeof id === 'string' && id !== '' && typeof email === 'string' ? { id, email } : null
  } catch {
    return null
  }
}

export function writeAccount(storage: KeyValue, account: Account): void {
  storage.setItem(KEYS.account, JSON.stringify(account))
}

/** The mark of this copy of the data; made on first use. */
export function currentEpoch(storage: KeyValue): string {
  let epoch = storage.getItem(KEYS.epoch)
  if (!epoch) {
    epoch = crypto.randomUUID()
    storage.setItem(KEYS.epoch, epoch)
  }
  return epoch
}

/** Gives the device a new mark: every sync that began under the old one stops before it writes. */
export function newEpoch(storage: KeyValue): void {
  storage.setItem(KEYS.epoch, crypto.randomUUID())
}

/** Forgets everything but the mark. `tables` are the synced tables' names. */
export function forgetDevice(storage: KeyValue, tables: readonly string[]): void {
  storage.removeItem(KEYS.account)
  storage.removeItem(KEYS.lastSyncedAt)
  for (const table of tables) storage.removeItem(KEYS.cursor(table))
}

/** A store that lasts as long as the page; for tests. */
export function memoryStorage(): KeyValue {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}
