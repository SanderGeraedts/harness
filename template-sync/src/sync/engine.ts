import { statusOf } from '../auth/auth'
import type { AppDb, SyncedTable } from '../db/db'
import { fromServer, isNewer, serverSlugs, SYNCED_TABLES, toServer, type LocalRecord, type ServerRecord } from './records'
import { currentEpoch, KEYS, type KeyValue } from './state'

// The sync engine (D-0002, D-0007). The backend is the master copy; each run
//
// 1. pushes the outbox in order. A row is removed only after the backend confirmed the state
//    of the record that includes it; a failure keeps every row, and the run is tried again
//    later. Rows for one record go up as one push of its current state, at the place of its
//    oldest row.
// 2. pulls what changed on the backend since the last pull, and writes it straight into
//    Dexie (not through src/db/write.ts, which would queue it again). The newest `updatedAt`
//    wins; a record with a change still in the outbox is left alone, because its push
//    settles it.
// 3. renews the sign-in, which also proves it is still good.
//
// Newest-wins itself is decided on the backend (backend/pb_hooks/newest_wins.pb.js): a push
// older than the stored record is answered with the stored record, which the device takes
// over. Slugs are settled there too (D-0005): the device takes the backend's slug from every
// record it sends, unless a change of its own is waiting.
//
// One run at a time, across tabs (Web Locks). A sign-in that ended pauses sync and keeps the
// outbox (D-0009).

/** The part of the backend's record API sync uses; the real client fits, and so does a fake. */
export interface RecordApi {
  getList(page: number, perPage: number, options?: Record<string, unknown>): Promise<{ items: ServerRecord[] }>
  create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<ServerRecord>
  update(id: string, body: Record<string, unknown>, options?: Record<string, unknown>): Promise<ServerRecord>
}

export interface SyncClient {
  authStore: { readonly record: { id: string } | null }
  collection(name: string): RecordApi
}

/** The part of src/auth sync needs. */
export interface SyncAuth {
  state(): 'signed-out' | 'signed-in' | 'ended'
  end(): void
  renew(): Promise<unknown>
  subscribe?(listener: () => void): () => void
}

/** Runs `fn` while holding the one sync lock (across tabs in the browser). */
export type SyncLock = <T>(fn: () => Promise<T>) => Promise<T>

/** Why the last run failed, in the two kinds the interface tells apart. */
export type SyncError = 'no-connection' | 'other'

/** What the sync status shows. Times are ISO strings. */
export interface SyncStatus {
  running: boolean
  /** The end of the last run that pushed and pulled everything. */
  lastSyncedAt: string | null
  /** The last run's failure; null after a run that worked. */
  lastError: SyncError | null
  lastErrorAt: string | null
}

export interface SyncEngineOptions {
  db: AppDb
  client: SyncClient
  auth: SyncAuth
  storage: KeyValue
  lock?: SyncLock
  /** The wait after a change on the device before it syncs (ms). */
  debounceMs?: number
  /** The wait after a failed run: the base doubles with every failure, up to the maximum (ms). */
  retryBaseMs?: number
  retryMaxMs?: number
  /** Records per pull request. */
  pageSize?: number
}

export const LOCK_NAME = '__PROJECT_NAME__-sync'

/**
 * Each pull starts this far before where the last one ended, so a record the backend saved
 * with an earlier `updated` but finished writing after a later one is still seen. Taking a
 * record in twice changes nothing.
 */
export const PULL_OVERLAP_MS = 60_000

/** The device was cleared under a running sync (a sign-out): stop without writing. */
class Cancelled extends Error {
  constructor() {
    super('sync cancelled: the device was cleared')
  }
}

/** The sign-in turned out to have ended. */
class SignInEnded extends Error {
  constructor() {
    super('sync paused: the sign-in has ended')
  }
}

function responseError(status: number): Error {
  return Object.assign(new Error(`the backend answered ${status}`), { status })
}

/** The backend writes `updated` as "2026-01-02 10:00:00.123Z". */
function shiftServerTime(time: string, ms: number): string {
  const parsed = Date.parse(time.replace(' ', 'T'))
  if (Number.isNaN(parsed)) return time
  return new Date(parsed + ms).toISOString().replace('T', ' ')
}

/** A string literal in one of the backend's filters. */
const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** One run at a time in this tab, where Web Locks are missing (in tests). */
function inTabLock(): SyncLock {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn, fn)
    tail = result.catch(() => {})
    return result
  }
}

/** Web Locks: one sync across all tabs of the app; one per tab without them. */
export function defaultLock(): SyncLock {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request) return inTabLock()
  return <T>(fn: () => Promise<T>) => locks.request(LOCK_NAME, () => fn()) as Promise<T>
}

export function createSyncEngine(options: SyncEngineOptions) {
  const { db, client, auth, storage } = options
  const lock = options.lock ?? defaultLock()
  const debounceMs = options.debounceMs ?? 2_000
  const retryBaseMs = options.retryBaseMs ?? 5_000
  const retryMaxMs = options.retryMaxMs ?? 5 * 60_000
  const pageSize = options.pageSize ?? 200
  // The client would otherwise cancel a request when the same one is made again.
  const requestOptions = { requestKey: null }

  let status: SyncStatus = { running: false, lastSyncedAt: storage.getItem(KEYS.lastSyncedAt), lastError: null, lastErrorAt: null }
  const listeners = new Set<() => void>()
  function update(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch }
    for (const listener of [...listeners]) listener()
  }

  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  /** Inside a write transaction: stop when the device was cleared since the run began. */
  function checkEpoch(epoch: string): void {
    if (storage.getItem(KEYS.epoch) !== epoch) throw new Cancelled()
  }

  const pendingFor = (table: SyncedTable, id: string) => db.outbox.where('[table+recordId]').equals([table, id]).count()

  // --- Push ---

  /** Creates or updates one record on the backend under its own id; returns what is stored. */
  async function upsert(table: SyncedTable, record: LocalRecord): Promise<ServerRecord> {
    const api = client.collection(table)
    const body = toServer(table, record)
    for (let attempt = 0; ; attempt++) {
      try {
        return await api.update(record.id, body, requestOptions)
      } catch (err) {
        if (statusOf(err) !== 404) throw err
      }
      const owner = client.authStore.record?.id
      if (!owner) throw responseError(401)
      try {
        return await api.create({ id: record.id, owner, ...body }, requestOptions)
      } catch (err) {
        // A 400 can mean another run made it in between: update it instead, once.
        if (statusOf(err) !== 400 || attempt === 1) throw err
      }
    }
  }

  /**
   * Takes the backend's slug and earlier slugs for a record the device has, unless a change
   * of its own is waiting. Returns whether anything changed. Call inside a transaction on
   * the table and the outbox.
   */
  async function takeSlugs(tableName: SyncedTable, remote: ServerRecord, local: LocalRecord): Promise<boolean> {
    const slugs = serverSlugs(remote)
    if (!slugs) return false
    if (slugs.slug === local.slug && slugs.oldSlugs.join(' ') === local.oldSlugs.join(' ')) return false
    if ((await pendingFor(tableName, local.id)) > 0) return false
    await db.table<LocalRecord, string>(tableName).update(local.id, slugs)
    return true
  }

  /** Pushes the outbox in order; throws on the first failure, with every unconfirmed row kept. */
  async function push(epoch: string): Promise<void> {
    for (;;) {
      const head = await db.outbox.orderBy('id').first()
      if (!head) return
      const table = db.table<LocalRecord, string>(head.table)
      // The record and every row for it, read together: the state pushed includes them all.
      const { rows, record } = await db.transaction('r', db.outbox, table, async () => ({
        rows: await db.outbox.where('[table+recordId]').equals([head.table, head.recordId]).toArray(),
        record: await table.get(head.recordId),
      }))
      const rowIds = rows.map((row) => row.id!)

      if (!record) {
        // Records are never removed from the device, so a row without one has nothing to
        // send. Drop it rather than block the queue.
        await db.transaction('rw', db.outbox, () => {
          checkEpoch(epoch)
          return db.outbox.bulkDelete(rowIds)
        })
        continue
      }

      const stored = await upsert(head.table, record)

      // Confirmed: remove exactly the rows this push covered, and take over the backend's
      // version when it won (D-0007), or its slug when it settled one (D-0005).
      await db.transaction('rw', db.outbox, table, async () => {
        checkEpoch(epoch)
        await db.outbox.bulkDelete(rowIds)
        const local = await table.get(head.recordId)
        if (!local) return
        if (isNewer(String(stored.updatedAt ?? ''), local.updatedAt)) await table.put(fromServer(head.table, stored))
        else await takeSlugs(head.table, stored, local)
      })
    }
  }

  // --- Pull ---

  async function pull(tableName: SyncedTable, epoch: string): Promise<void> {
    const api = client.collection(tableName)
    const table = db.table<LocalRecord, string>(tableName)
    const cursor = storage.getItem(KEYS.cursor(tableName)) ?? ''
    // Only this account's records, whatever the backend's rules would also show (D-0006).
    const owner = client.authStore.record?.id
    if (!owner) throw responseError(401)
    const since = cursor ? shiftServerTime(cursor, -PULL_OVERLAP_MS) : ''
    // Paging by (updated, id): steady while records change during the pull.
    let after: { updated: string; id: string } | null = null
    for (;;) {
      const range: string = after
        ? `(updated > ${quote(after.updated)} || (updated = ${quote(after.updated)} && id > ${quote(after.id)}))`
        : since
          ? `updated >= ${quote(since)}`
          : ''
      const filter = range ? `owner = ${quote(owner)} && ${range}` : `owner = ${quote(owner)}`
      const { items } = await api.getList(1, pageSize, { filter, sort: 'updated,id', skipTotal: true, ...requestOptions })
      const last = items[items.length - 1]
      if (!last) return

      await db.transaction('rw', db.outbox, table, async () => {
        checkEpoch(epoch)
        for (const remote of items) {
          if ((await pendingFor(tableName, remote.id)) > 0) continue // its push settles it
          const local = await table.get(remote.id)
          if (local && !isNewer(String(remote.updatedAt ?? ''), local.updatedAt)) await takeSlugs(tableName, remote, local)
          else await table.put(fromServer(tableName, remote))
        }
      })
      checkEpoch(epoch)
      if (last.updated > (storage.getItem(KEYS.cursor(tableName)) ?? '')) storage.setItem(KEYS.cursor(tableName), last.updated)
      after = { updated: last.updated, id: last.id }
      if (items.length < pageSize) return
    }
  }

  // --- A run ---

  function scheduleRetry() {
    clearTimeout(retryTimer)
    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(failures - 1, 16))
    retryTimer = setTimeout(() => void syncNow(), delay)
  }

  async function run(): Promise<void> {
    clearTimeout(retryTimer)
    // Nothing to do until the user signs in (again); the outbox waits (D-0009).
    if (auth.state() !== 'signed-in') return

    update({ running: true })
    try {
      const epoch = currentEpoch(storage)
      let error: unknown = null
      try {
        await push(epoch)
      } catch (err) {
        if (err instanceof Cancelled) throw err
        error = err // still pull: records with a change in the outbox are left alone
      }
      for (const table of SYNCED_TABLES) {
        try {
          await pull(table, epoch)
        } catch (err) {
          if (err instanceof Cancelled) throw err
          error ??= err
        }
      }
      // The backend treats a token it refuses as no sign-in at all: a push then fails like a
      // record that isn't there, and a pull comes back empty. So every run asks the sign-in
      // itself, which also renews it. Without a connection there is nobody to ask.
      if (!error || statusOf(error) !== 0) await auth.renew()
      if (auth.state() !== 'signed-in') throw new SignInEnded()
      if (error) throw error

      checkEpoch(epoch)
      const now = new Date().toISOString()
      storage.setItem(KEYS.lastSyncedAt, now)
      failures = 0
      update({ lastSyncedAt: now, lastError: null, lastErrorAt: null })
    } catch (err) {
      if (err instanceof Cancelled) {
        // The device was cleared: nothing to report.
      } else if (err instanceof SignInEnded) {
        auth.end()
        update({ lastError: null, lastErrorAt: null })
      } else {
        console.warn('sync failed', err)
        failures++
        update({ lastError: statusOf(err) === 0 ? 'no-connection' : 'other', lastErrorAt: new Date().toISOString() })
        scheduleRetry()
      }
    } finally {
      update({ running: false })
    }
  }

  // One run at a time: a call while one runs gets one follow-up run, shared by every caller.
  let current: Promise<void> | null = null
  let queued: Promise<void> | null = null

  /** Runs a sync now, or right after the running one. Never rejects; see `getStatus()`. */
  function syncNow(): Promise<void> {
    if (!current) {
      current = lock(run)
        .catch((err: unknown) => console.warn('sync failed', err))
        .finally(() => {
          current = null
        })
      return current
    }
    queued ??= current.then(() => {
      queued = null
      return syncNow()
    })
    return queued
  }

  /** Syncs a little after a change on the device, so a burst of changes goes up in one run. */
  function syncSoon(): void {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void syncNow(), debounceMs)
  }

  const stops: (() => void)[] = []

  /**
   * Starts syncing by itself: now, when the device comes back online or the app into view,
   * after a sign-in, and shortly after each change on the device. Returns `stop`.
   */
  function start(): () => void {
    const on = (target: EventTarget, type: string, fn: () => void) => {
      target.addEventListener(type, fn)
      stops.push(() => target.removeEventListener(type, fn))
    }
    if (typeof window !== 'undefined') on(window, 'online', () => void syncNow())
    if (typeof document !== 'undefined') {
      on(document, 'visibilitychange', () => {
        if (document.visibilityState === 'visible') void syncNow()
      })
    }
    if (auth.subscribe) {
      let was = auth.state()
      stops.push(
        auth.subscribe(() => {
          const now = auth.state()
          if (now === 'signed-out' && was !== 'signed-out') {
            // The device was cleared: what the last sync reported went with it.
            clearTimeout(retryTimer)
            failures = 0
            update({ lastSyncedAt: null, lastError: null, lastErrorAt: null })
          }
          if (now === 'signed-in' && was !== 'signed-in') void syncNow()
          was = now
        }),
      )
    }
    // Every write adds an outbox row in the same transaction (src/db/write.ts).
    const onOutbox = () => syncSoon()
    db.outbox.hook('creating', onOutbox)
    stops.push(() => db.outbox.hook('creating').unsubscribe(onOutbox))

    void syncNow()
    return stop
  }

  /** Stops the runs it starts by itself, and a waiting retry. A running sync finishes. */
  function stop(): void {
    for (const fn of stops.splice(0)) fn()
    clearTimeout(retryTimer)
    clearTimeout(debounceTimer)
  }

  return {
    syncNow,
    syncSoon,
    start,
    stop,
    getStatus: (): SyncStatus => status,
    /** Calls `listener` on every change of the status. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
