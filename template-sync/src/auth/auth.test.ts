import { afterEach, describe, expect, it } from 'vitest'
import { openDb, type AppDb } from '../db/db'
import { createItem } from '../db/write'
import { KEYS, memoryStorage, writeAccount } from '../sync/state'
import { responseError } from '../sync/testing'
import { createAuth, type AuthClient } from './auth'

let n = 0
const dbs: AppDb[] = []
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const USERS: Record<string, { id: string; password: string }> = {
  'ada@example.invalid': { id: 'u1', password: 'correct horse' },
  'bob@example.invalid': { id: 'u2', password: 'battery staple' },
}

/** A stand-in for the backend's client: a token store and the two calls auth makes. */
function fakeClient() {
  const listeners = new Set<() => void>()
  const store = {
    isValid: false,
    record: null as { id: string; email: string } | null,
    clear() {
      store.isValid = false
      store.record = null
      for (const listener of [...listeners]) listener()
    },
    save(record: { id: string; email: string }) {
      store.isValid = true
      store.record = record
      for (const listener of [...listeners]) listener()
    },
    onChange(callback: () => void) {
      listeners.add(callback)
      return () => void listeners.delete(callback)
    },
  }
  const control = { fail: null as Error | null, refreshes: 0 }
  const client: AuthClient = {
    authStore: store,
    collection: () => ({
      async authWithPassword(email, password) {
        if (control.fail) throw control.fail
        const user = USERS[email]
        if (!user || user.password !== password) throw responseError(400)
        store.save({ id: user.id, email })
      },
      async authRefresh() {
        control.refreshes++
        if (control.fail) throw control.fail
      },
    }),
  }
  return { client, store, control }
}

function setup({ syncNow }: { syncNow?: () => Promise<void> } = {}) {
  const db = openDb(`auth-test-${++n}`)
  dbs.push(db)
  const storage = memoryStorage()
  const fake = fakeClient()
  const auth = createAuth({ client: fake.client, db, storage, syncNow })
  return { db, storage, auth, ...fake }
}

describe('signing in', () => {
  it('starts signed out, and a sign-in makes the account the owner of this device', async () => {
    const { auth, storage } = setup()
    expect(auth.state()).toBe('signed-out')
    expect(await auth.signIn(' ada@example.invalid ', 'correct horse')).toBe('ok')
    expect(auth.state()).toBe('signed-in')
    expect(auth.account()).toEqual({ id: 'u1', email: 'ada@example.invalid' })
    expect(JSON.parse(storage.getItem(KEYS.account)!)).toEqual({ id: 'u1', email: 'ada@example.invalid' })
  })

  it('tells a wrong password, no answer and anything else apart', async () => {
    const { auth, control } = setup()
    expect(await auth.signIn('ada@example.invalid', 'nope')).toBe('wrong')
    expect(await auth.signIn('nobody@example.invalid', 'correct horse')).toBe('wrong')
    control.fail = responseError(0)
    expect(await auth.signIn('ada@example.invalid', 'correct horse')).toBe('no-connection')
    control.fail = responseError(429)
    expect(await auth.signIn('ada@example.invalid', 'correct horse')).toBe('failed')
    control.fail = responseError(500)
    expect(await auth.signIn('ada@example.invalid', 'correct horse')).toBe('failed')
    expect(auth.state()).toBe('signed-out')
  })

  it('tells its listeners', async () => {
    const { auth } = setup()
    const seen: string[] = []
    const stop = auth.subscribe(() => seen.push(auth.state()))
    await auth.signIn('ada@example.invalid', 'correct horse')
    expect(seen.at(-1)).toBe('signed-in')
    stop()
  })
})

describe('a sign-in that ended (D-0009, D-0010)', () => {
  it('keeps the account and everything on the device, whether the backend refused it or its date passed', async () => {
    const { auth, db, control, store } = setup()
    await auth.signIn('ada@example.invalid', 'correct horse')
    await createItem({ title: 'Mine' }, db)

    control.fail = responseError(401)
    expect(await auth.renew()).toBe('ended')
    expect(auth.account()).toEqual({ id: 'u1', email: 'ada@example.invalid' })
    expect(await db.items.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)

    // The same for a token whose date passed: the client says it is no longer valid.
    control.fail = null
    await auth.signIn('ada@example.invalid', 'correct horse')
    store.isValid = false
    expect(auth.state()).toBe('ended')
    expect(await db.items.count()).toBe(1)
  })

  it('a backend that can not be reached ends nothing', async () => {
    const { auth, control } = setup()
    await auth.signIn('ada@example.invalid', 'correct horse')
    for (const status of [0, 429, 500]) {
      control.fail = responseError(status)
      expect(await auth.renew()).toBe('signed-in')
    }
  })

  it('only the same account signs in again', async () => {
    const { auth, control } = setup()
    await auth.signIn('ada@example.invalid', 'correct horse')
    control.fail = responseError(401)
    await auth.renew()
    control.fail = null

    expect(await auth.signIn('bob@example.invalid', 'battery staple')).toBe('wrong')
    expect(auth.state()).toBe('ended')
    expect(auth.account()?.id).toBe('u1')

    expect(await auth.signIn('ada@example.invalid', 'correct horse')).toBe('ok')
    expect(auth.state()).toBe('signed-in')
  })

  it('is what a device with an account but no token starts in', () => {
    const db = openDb(`auth-test-${++n}`)
    dbs.push(db)
    const storage = memoryStorage()
    writeAccount(storage, { id: 'u1', email: 'ada@example.invalid' })
    const auth = createAuth({ client: fakeClient().client, db, storage })
    expect(auth.state()).toBe('ended')
  })
})

describe('signing out (D-0009)', () => {
  it('syncs first, and with everything synced clears the device', async () => {
    let synced = 0
    const { auth, db, storage, store } = setup({
      syncNow: async () => {
        synced++
        await db.outbox.clear() // the backend confirmed everything
      },
    })
    await auth.signIn('ada@example.invalid', 'correct horse')
    await createItem({ title: 'Mine' }, db)
    storage.setItem(KEYS.lastSyncedAt, '2026-01-02T10:00:00.000Z')
    storage.setItem(KEYS.cursor('items'), '2026-01-02 10:00:00.000Z')
    const epoch = storage.getItem(KEYS.epoch)

    expect(await auth.signOut()).toEqual({ done: true })
    expect(synced).toBe(1)
    expect(auth.state()).toBe('signed-out')
    expect(auth.account()).toBeNull()
    expect(store.record).toBeNull()
    expect(await db.items.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    for (const key of [KEYS.account, KEYS.lastSyncedAt, KEYS.cursor('items')]) expect(storage.getItem(key)).toBeNull()
    // A new mark: a sync that was still running stops before it writes.
    expect(storage.getItem(KEYS.epoch)).not.toBe(epoch)
  })

  it('with changes that could not sync, clears nothing and says how many, until it is forced', async () => {
    const { auth, db } = setup({ syncNow: async () => {} })
    await auth.signIn('ada@example.invalid', 'correct horse')
    const item = await createItem({ title: 'Not synced' }, db)
    await createItem({ title: 'Nor this' }, db)

    expect(await auth.signOut()).toEqual({ done: false, unsynced: 2 })
    expect(auth.state()).toBe('signed-in')
    expect(await db.items.get(item.id)).toMatchObject({ title: 'Not synced' })
    expect(await db.outbox.count()).toBe(2)

    expect(await auth.signOut({ force: true })).toEqual({ done: true })
    expect(await db.items.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(auth.state()).toBe('signed-out')
  })

  it('after the sign-in ended it can not sync first: it asks at once, or clears when nothing waits', async () => {
    let synced = 0
    const { auth, db, control } = setup({ syncNow: async () => void synced++ })
    await auth.signIn('ada@example.invalid', 'correct horse')
    control.fail = responseError(401)
    await auth.renew()
    await createItem({ title: 'Waiting' }, db)

    expect(await auth.signOut()).toEqual({ done: false, unsynced: 1 })
    expect(synced).toBe(0)
    await db.outbox.clear()
    expect(await auth.signOut()).toEqual({ done: true })
    expect(auth.state()).toBe('signed-out')
  })
})
