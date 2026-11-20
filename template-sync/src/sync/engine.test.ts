import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type AppDb } from '../db/db'
import { countUnsynced, createItem, deleteItem, updateItem } from '../db/write'
import { createSyncEngine, type SyncEngine } from './engine'
import { KEYS, memoryStorage, newEpoch } from './state'
import { FakeBackend, fakeAuth, responseError } from './testing'

// The engine against a fake backend (./testing.ts). The same against the real image is in
// sync.backend.test.ts, run by the backend workflow.

let n = 0
const dbs: AppDb[] = []
const engines: SyncEngine[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const engine of engines.splice(0)) engine.stop()
  for (const db of dbs.splice(0)) await db.delete()
})

/** Pins the clock, so `updatedAt` says which change came last. Only Date is faked. */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

/** A device: its own database and its own memory, signed in to `backend` as `user`. */
function device(backend: FakeBackend, user = 'u1', options: { pageSize?: number } = {}) {
  const db = openDb(`engine-test-${++n}`)
  dbs.push(db)
  const client = backend.client(user)
  const auth = fakeAuth(client)
  const storage = memoryStorage()
  const engine = createSyncEngine({ db, client, auth, storage, retryBaseMs: 1_000_000, retryMaxMs: 1_000_000, ...options })
  engines.push(engine)
  const sync = async () => {
    await engine.syncNow()
    return engine.getStatus()
  }
  const live = async () => (await db.items.toArray()).filter((i) => i.deletedAt === null).map((i) => i.title).sort()
  return { db, client, auth, storage, engine, sync, live }
}

const byId = <T extends { id: string }>(records: T[]) => [...records].sort((a, b) => (a.id < b.id ? -1 : 1))

describe('two devices of one account', () => {
  it('each with changes made offline, end up with the same items, tombstones included', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    const laptop = device(backend)

    at('2026-03-01T09:00:00.000Z')
    const shared = await createItem({ title: 'Shared' }, phone.db)
    const doomed = await createItem({ title: 'Doomed' }, phone.db)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.live()).toEqual(['Doomed', 'Shared'])

    // Both go offline and change things.
    at('2026-03-01T10:00:00.000Z')
    await updateItem(shared.id, { note: 'from the phone' }, phone.db)
    await createItem({ title: 'Only on the phone' }, phone.db)
    at('2026-03-01T11:00:00.000Z')
    await deleteItem(doomed.id, laptop.db)
    await createItem({ title: 'Only on the laptop' }, laptop.db)

    // Back online, in any order.
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await laptop.sync()).toMatchObject({ lastError: null })

    expect(byId(await phone.db.items.toArray())).toEqual(byId(await laptop.db.items.toArray()))
    expect(await phone.live()).toEqual(['Only on the laptop', 'Only on the phone', 'Shared'])
    // The delete arrived as a tombstone: the record is still there, marked.
    expect((await phone.db.items.get(doomed.id))?.deletedAt).toBe('2026-03-01T11:00:00.000Z')
    expect((await phone.db.items.get(shared.id))?.note).toBe('from the phone')
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(await countUnsynced(laptop.db)).toBe(0)
  })

  it('the newest change to one record wins on both, whichever syncs first', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    const laptop = device(backend)
    at('2026-03-01T09:00:00.000Z')
    const item = await createItem({ title: 'Tea' }, phone.db)
    await phone.sync()
    await laptop.sync()

    at('2026-03-01T10:00:00.000Z')
    await updateItem(item.id, { note: 'older, from the phone' }, phone.db)
    at('2026-03-01T11:00:00.000Z')
    await updateItem(item.id, { note: 'newer, from the laptop' }, laptop.db)

    // The newer one goes up first; the older push is answered with the stored record.
    await laptop.sync()
    await phone.sync()
    expect((await phone.db.items.get(item.id))?.note).toBe('newer, from the laptop')
    expect(backend.get('items', item.id)?.note).toBe('newer, from the laptop')
    expect(await countUnsynced(phone.db)).toBe(0)
  })

  it('a slug both picked offline is settled by the backend, and the device takes its answer', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    const laptop = device(backend)
    at('2026-03-01T09:00:00.000Z')
    const first = await createItem({ title: 'Shopping list' }, phone.db)
    at('2026-03-01T09:05:00.000Z')
    const second = await createItem({ title: 'Shopping list' }, laptop.db)
    expect([first.slug, second.slug]).toEqual(['shopping-list', 'shopping-list'])

    await phone.sync()
    await laptop.sync()
    await phone.sync()
    expect((await laptop.db.items.get(second.id))?.slug).toBe('shopping-list-2')
    expect((await phone.db.items.get(second.id))?.slug).toBe('shopping-list-2')
    expect((await laptop.db.items.get(first.id))?.slug).toBe('shopping-list')
    // The backend's slug came without a new updatedAt, and needs no new push.
    expect((await laptop.db.items.get(second.id))?.updatedAt).toBe('2026-03-01T09:05:00.000Z')
    expect(await countUnsynced(laptop.db)).toBe(0)
  })

  it('a change that is still waiting is not overwritten by what a pull brings', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    const laptop = device(backend)
    at('2026-03-01T09:00:00.000Z')
    const item = await createItem({ title: 'Tea' }, phone.db)
    await phone.sync()
    await laptop.sync()

    at('2026-03-01T10:00:00.000Z')
    await updateItem(item.id, { note: 'from the phone' }, phone.db)
    await phone.sync()
    at('2026-03-01T11:00:00.000Z')
    await updateItem(item.id, { note: 'from the laptop, later' }, laptop.db)
    // The laptop can't send, but can fetch.
    backend.interceptor = (op) => (op === 'update' ? responseError(500) : undefined)
    expect(await laptop.sync()).toMatchObject({ lastError: 'other' })
    expect((await laptop.db.items.get(item.id))?.note).toBe('from the laptop, later')
    expect(await countUnsynced(laptop.db)).toBe(1)
  })
})

describe('what goes wrong', () => {
  it('a backend that gives no answer keeps every change, and the next run sends them', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await createItem({ title: 'One' }, phone.db)
    await createItem({ title: 'Two' }, phone.db)

    backend.interceptor = () => responseError(0)
    expect(await phone.sync()).toMatchObject({ lastError: 'no-connection', lastSyncedAt: null })
    expect(phone.engine.getStatus().lastErrorAt).not.toBeNull()
    expect(await countUnsynced(phone.db)).toBe(2)
    expect(phone.auth.state()).toBe('signed-in')

    backend.interceptor = null
    const status = await phone.sync()
    expect(status).toMatchObject({ lastError: null, lastErrorAt: null, running: false })
    expect(status.lastSyncedAt).not.toBeNull()
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(backend.all('items').map((r) => r.title).sort()).toEqual(['One', 'Two'])
  })

  it('a fault on the backend is an error of the other kind', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await createItem({ title: 'One' }, phone.db)
    backend.interceptor = () => responseError(500)
    expect(await phone.sync()).toMatchObject({ lastError: 'other' })
    expect(await countUnsynced(phone.db)).toBe(1)
  })

  it('sends the changes in the order they were made', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    const a = await createItem({ title: 'First' }, phone.db)
    const b = await createItem({ title: 'Second' }, phone.db)
    await updateItem(a.id, { note: 'changed' }, phone.db)
    await phone.sync()
    const writes = backend.requests.filter((r) => r.op === 'create').map((r) => r.id)
    expect(writes).toEqual([a.id, b.id])
    // Two rows for the first item went up as one push of its current state.
    expect(backend.get('items', a.id)?.note).toBe('changed')
    expect(await countUnsynced(phone.db)).toBe(0)
  })
})

describe('a sign-in that ended', () => {
  it('pauses sync, keeps every change, and reports no error', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    await createItem({ title: 'Before' }, phone.db)
    await phone.sync()

    // The backend stops accepting the token: it sees a visitor from now on.
    phone.client.signedIn = false
    const waiting = await createItem({ title: 'Made after the sign-in ended' }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, running: false })
    expect(phone.auth.state()).toBe('ended')
    expect(await countUnsynced(phone.db)).toBe(1)
    // Everything on the device stays, and can still be changed.
    await updateItem(waiting.id, { note: 'still editable' }, phone.db)
    expect(await phone.live()).toEqual(['Before', 'Made after the sign-in ended'])

    // While it has ended, a run does nothing at all.
    const before = backend.requests.length
    await phone.sync()
    expect(backend.requests.length).toBe(before)

    // Signed in again: the waiting changes reach the backend.
    phone.auth.set('signed-in')
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(backend.get('items', waiting.id)?.note).toBe('still editable')
  })

  it('is noticed by a run that had nothing to send', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    await phone.sync()
    phone.client.signedIn = false
    await phone.sync()
    expect(phone.auth.state()).toBe('ended')
  })

  it('every run that worked renews the sign-in', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    await phone.sync()
    await phone.sync()
    expect(phone.auth.renewals).toBe(2)
  })
})

describe('whose records', () => {
  it("takes in only its own account's records", async () => {
    const backend = new FakeBackend()
    const mine = device(backend, 'u1')
    const theirs = device(backend, 'u2')
    await createItem({ title: 'Mine' }, mine.db)
    await createItem({ title: 'Theirs' }, theirs.db)
    await mine.sync()
    await theirs.sync()
    await mine.sync()
    expect(await mine.live()).toEqual(['Mine'])
    expect(await theirs.live()).toEqual(['Theirs'])
    expect(backend.all('items').map((r) => r.owner).sort()).toEqual(['u1', 'u2'])
  })
})

describe('pulling', () => {
  it('fetches page by page, and next time only what changed since', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    for (const title of ['A', 'B', 'C', 'D', 'E']) await createItem({ title }, phone.db)
    await phone.sync()

    const laptop = device(backend, 'u1', { pageSize: 2 })
    await laptop.sync()
    expect(await laptop.live()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(backend.requests.filter((r) => r.op === 'getList').length).toBeGreaterThanOrEqual(3)
    expect(laptop.storage.getItem(KEYS.cursor('items'))).toBe(backend.all('items').map((r) => r.updated).sort().at(-1))

    await createItem({ title: 'F' }, phone.db)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.live()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })
})

describe('a device that is cleared while a sync runs', () => {
  it('takes nothing more in', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    await createItem({ title: 'Kept on the backend' }, phone.db)
    await phone.sync()

    const laptop = device(backend)
    // The sign-out lands between the request and the write.
    backend.interceptor = (op) => {
      if (op === 'getList') newEpoch(laptop.storage)
    }
    const status = await laptop.sync()
    expect(await laptop.db.items.count()).toBe(0)
    expect(status).toMatchObject({ lastError: null, lastSyncedAt: null, running: false })
    expect(laptop.storage.getItem(KEYS.lastSyncedAt)).toBeNull()
  })
})

describe('starting by itself', () => {
  it('does nothing while nobody is signed in, and syncs as soon as somebody is', async () => {
    const backend = new FakeBackend()
    const phone = device(backend)
    phone.auth.set('signed-out')
    await createItem({ title: 'Waiting' }, phone.db)
    phone.engine.start()
    await phone.engine.syncNow()
    expect(backend.requests).toEqual([])

    phone.auth.set('signed-in')
    await phone.engine.syncNow()
    expect(backend.all('items').map((r) => r.title)).toEqual(['Waiting'])
  })
})
