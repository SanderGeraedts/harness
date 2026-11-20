import type { AppDb } from '../db/db'
import { forgetDevice, newEpoch, readAccount, writeAccount, type Account, type KeyValue } from '../sync/state'

// Signing in and out (D-0006, D-0009, D-0010). A user signs in with e-mail and password
// against the backend's `users` collection; the backend's client keeps the token.
//
// Two rules shape everything here:
// - Only the user's own sign-out ever clears the device (D-0009). A sign-in that ends, by
//   its date or because the backend refuses it, only pauses sync: the account stays the
//   owner of what is on the device, and everything can still be read and changed.
// - After a sign-in ended, only the same account signs in again (D-0010): what is on the
//   device must not sync as another account's.

/**
 * - `signed-out`: no account owns this device's data. The device is empty.
 * - `signed-in`: an account owns it, with a token whose date hasn't passed.
 * - `ended`: an account owns it, but its token ran out or the backend refused it.
 */
export type AuthState = 'signed-out' | 'signed-in' | 'ended'

/** `wrong`: the e-mail and password don't match. `no-connection`: no answer. `failed`: anything else. */
export type SignInResult = 'ok' | 'wrong' | 'no-connection' | 'failed'

export type SignOutResult = { done: true } | { done: false; unsynced: number }

export const AUTH_COLLECTION = 'users'

/** The part of the backend's client used here; the real client fits, and so does a fake. */
export interface AuthClient {
  authStore: {
    readonly isValid: boolean
    readonly record: { id: string; [field: string]: unknown } | null
    clear(): void
    onChange(callback: () => void): () => void
  }
  collection(name: string): {
    authWithPassword(email: string, password: string): Promise<unknown>
    authRefresh(): Promise<unknown>
  }
}

/** The HTTP status of an error from the backend's client; 0 when there was no answer. */
export function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const { status, isAbort } = err as { status?: unknown; isAbort?: unknown }
  if (isAbort === true) return 0
  return typeof status === 'number' ? status : undefined
}

function signInResult(err: unknown): SignInResult {
  const status = statusOf(err)
  if (status === 0) return 'no-connection'
  // The backend answers a wrong e-mail and a wrong password the same way.
  if (status === 400 || status === 401 || status === 403) return 'wrong'
  return 'failed'
}

export interface AuthOptions {
  client: AuthClient
  db: AppDb
  storage: KeyValue
  /** One sync run that never rejects; a sign-out syncs first. */
  syncNow?: () => Promise<void>
}

export function createAuth({ client, db, storage, syncNow = async () => {} }: AuthOptions) {
  const store = client.authStore
  const users = () => client.collection(AUTH_COLLECTION)
  let account = readAccount(storage)
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  store.onChange(notify)

  function state(): AuthState {
    if (!account) return 'signed-out'
    return store.isValid && store.record?.id === account.id ? 'signed-in' : 'ended'
  }

  /** The sign-in is no longer good: sync pauses, and nothing on the device changes. */
  function end(): void {
    store.clear()
    notify()
  }

  return {
    state,

    /** The account that owns what is on this device, also after its sign-in ended. */
    account: (): Account | null => account,

    /** Calls `listener` on every sign-in, renewal, end and sign-out. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Reads the account again, after another tab signed in or out. */
    reload(): void {
      account = readAccount(storage)
      notify()
    },

    async signIn(email: string, password: string): Promise<SignInResult> {
      try {
        await users().authWithPassword(email.trim(), password)
      } catch (err) {
        return signInResult(err)
      }
      const record = store.record
      if (!record) return 'failed'
      if (account && record.id !== account.id) {
        // D-0010: another account than the one that owns this device's data.
        store.clear()
        return 'wrong'
      }
      account = { id: record.id, email: typeof record.email === 'string' && record.email ? record.email : email.trim() }
      writeAccount(storage, account)
      notify()
      return 'ok'
    },

    /**
     * Asks the backend for a new token, which also proves the sign-in is still good. The
     * sync engine calls it in every run. A refusal ends the sign-in; a backend that can't be
     * reached changes nothing. Never throws, never touches the data on the device.
     */
    async renew(): Promise<AuthState> {
      if (state() !== 'signed-in') return state()
      try {
        await users().authRefresh()
      } catch (err) {
        const status = statusOf(err)
        if (status === 401 || status === 403) end()
      }
      return state()
    },

    end,

    /**
     * D-0009: syncs once more, then clears the device: every table, what sync remembers, the
     * account and the token. With changes that still haven't synced it clears nothing and
     * says how many there are, unless `force` is set: the user was asked and said yes.
     */
    async signOut({ force = false }: { force?: boolean } = {}): Promise<SignOutResult> {
      if (state() === 'signed-in') await syncNow().catch(() => {})
      const unsynced = await db.outbox.count()
      if (unsynced > 0 && !force) return { done: false, unsynced }
      // The new mark first: a sync that is still running stops before it writes (engine.ts).
      newEpoch(storage)
      await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())))
      forgetDevice(
        storage,
        db.tables.map((table) => table.name),
      )
      account = null
      store.clear()
      notify()
      return { done: true }
    },
  }
}

export type Auth = ReturnType<typeof createAuth>
