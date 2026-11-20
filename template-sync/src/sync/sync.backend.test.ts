// Sign-in and sync against a real, throwaway backend built from backend/ (its migrations
// and hooks) on an empty database. The backend workflow starts one and runs this file with
// `pnpm run test:backend`; without BACKEND_TEST_URL it is skipped. It makes accounts and
// records: never point it at a real backend (G-0019).
//
// A device here is its own Dexie database, its own memory and its own client.
import PocketBase from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth, statusOf } from '../auth/auth'
import { openDb, type AppDb } from '../db/db'
import { countUnsynced, createItem, deleteItem, updateItem } from '../db/write'
import { createSyncEngine, type SyncEngine } from './engine'
import { memoryStorage } from './state'

const URL = process.env.BACKEND_TEST_URL ?? ''
const SU_EMAIL = process.env.BACKEND_TEST_SUPERUSER_EMAIL ?? 'admin@throwaway.invalid'
const SU_PASSWORD = process.env.BACKEND_TEST_SUPERUSER_PASSWORD ?? 'throwaway-only-password'
const PASSWORD = 'throwaway-only-password'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The backend allows a few sign-ins per second from one address: wait and try again on 429. */
async function patiently<T>(fn: () => Promise<T>, refused: (result: T) => boolean = () => false): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn()
      if (!refused(result) || attempt >= 10) return result
    } catch (err) {
      if (statusOf(err) !== 429 || attempt >= 10) throw err
    }
    await pause(1500)
  }
}

/**
 * Pins the clock at a number of minutes after a start, so `updatedAt` says which change came
 * last. Only Date is faked. The start is an hour before the real time: a sign-in's token is
 * judged by the same clock, and must not look as if its date had passed.
 */
const START = Date.now() - 60 * 60_000
const minute = (minutes: number) => new Date(START + minutes * 60_000)
function at(minutes: number) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(minute(minutes))
}

describe.skipIf(!URL)('sync against a throwaway backend', { timeout: 120_000 }, () => {
  if (URL && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) throw new Error(`${URL} is not on this machine: these tests run against a throwaway backend only`)

  const superuser = new PocketBase(URL)
  superuser.autoCancellation(false)
  let n = 0
  const dbs: AppDb[] = []
  const engines: SyncEngine[] = []

  beforeAll(async () => {
    await patiently(() => superuser.collection('_superusers').authWithPassword(SU_EMAIL, SU_PASSWORD))
  })

  afterEach(async () => {
    vi.useRealTimers()
    for (const engine of engines.splice(0)) engine.stop()
    for (const db of dbs.splice(0)) await db.delete()
  })

  /** A new account, made by the superuser as the Engineer does in the admin screen. */
  async function account() {
    const email = `sync-${Date.now()}-${++n}@throwaway.invalid`
    const record = await superuser.collection('users').create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    return { email, id: record.id }
  }

  /** A device signed in as `email`. */
  async function device(email: string, password = PASSWORD) {
    const db = openDb(`backend-test-${Date.now()}-${++n}`)
    dbs.push(db)
    const client = new PocketBase(URL)
    client.autoCancellation(false)
    const storage = memoryStorage()
    const auth = createAuth({ client, db, storage })
    const signIn = (pw: string) =>
      patiently(
        () => auth.signIn(email, pw),
        (result) => result === 'failed',
      )
    expect(await signIn(password)).toBe('ok')
    const engine = createSyncEngine({ db, client, auth, storage, retryBaseMs: 1_000_000, retryMaxMs: 1_000_000 })
    engines.push(engine)
    const sync = async () => {
      await engine.syncNow()
      return engine.getStatus()
    }
    const live = async () => (await db.items.toArray()).filter((i) => i.deletedAt === null).map((i) => i.title).sort()
    const all = async () => (await db.items.toArray()).sort((a, b) => (a.id < b.id ? -1 : 1))
    return { db, client, auth, engine, sync, live, all, signIn }
  }

  it('two devices of one account, each with changes made offline, end up with the same items, tombstones included', async () => {
    const { email } = await account()
    const phone = await device(email)
    const laptop = await device(email)

    at(0)
    const shared = await createItem({ title: 'Shared', note: 'first' }, phone.db)
    const doomed = await createItem({ title: 'Doomed' }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await laptop.live()).toEqual(['Doomed', 'Shared'])

    // Both are offline and change things.
    at(10)
    await updateItem(shared.id, { note: 'older, from the phone' }, phone.db)
    await createItem({ title: 'Only on the phone' }, phone.db)
    await createItem({ title: 'Shopping list' }, phone.db)
    at(20)
    await updateItem(shared.id, { note: 'newer, from the laptop', status: 'done' }, laptop.db)
    await deleteItem(doomed.id, laptop.db)
    await createItem({ title: 'Only on the laptop' }, laptop.db)
    const clash = await createItem({ title: 'Shopping list' }, laptop.db)

    // Back online: the laptop first, so the phone's older change arrives second.
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await laptop.sync()).toMatchObject({ lastError: null })

    expect(await phone.all()).toEqual(await laptop.all())
    expect(await phone.live()).toEqual(['Only on the laptop', 'Only on the phone', 'Shared', 'Shopping list', 'Shopping list'])
    // The newest change won, on both and on the backend.
    expect(await phone.db.items.get(shared.id)).toMatchObject({ note: 'newer, from the laptop', status: 'done' })
    expect(await superuser.collection('items').getOne(shared.id)).toMatchObject({ note: 'newer, from the laptop', status: 'done' })
    // The delete arrived as a tombstone.
    expect((await phone.db.items.get(doomed.id))?.deletedAt).toBe(minute(20).toISOString())
    // Two items with one slug: the backend gave the second a number, and both devices took it.
    const slugs = (await phone.all()).filter((i) => i.title === 'Shopping list').map((i) => i.slug).sort()
    expect(slugs).toEqual(['shopping-list', 'shopping-list-2'])
    expect((await laptop.db.items.get(clash.id))?.slug).toBe((await phone.db.items.get(clash.id))?.slug)
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(await countUnsynced(laptop.db)).toBe(0)
  })

  it('a record keeps the id its device gave it, and belongs to the account', async () => {
    const { email, id } = await account()
    const phone = await device(email)
    const item = await createItem({ title: 'Mine' }, phone.db)
    await phone.sync()
    expect(await superuser.collection('items').getOne(item.id)).toMatchObject({ title: 'Mine', owner: id, slug: 'mine' })
  })

  it("another account gets nothing of it", async () => {
    const owner = await device((await account()).email)
    const other = await device((await account()).email)
    await createItem({ title: 'Private' }, owner.db)
    await owner.sync()
    expect(await other.sync()).toMatchObject({ lastError: null })
    expect(await other.live()).toEqual([])
  })

  it('a sign-in the backend ended pauses sync and keeps every change; signing in again sends them', async () => {
    const { email, id } = await account()
    const phone = await device(email)
    await createItem({ title: 'Before' }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })

    // The Engineer changes the password: the backend refuses every token made before.
    const changed = 'another-throwaway-password'
    await superuser.collection('users').update(id, { password: changed, passwordConfirm: changed })

    const waiting = await createItem({ title: 'Made after the sign-in ended' }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(phone.auth.state()).toBe('ended')
    expect(phone.auth.account()?.email).toBe(email)
    expect(await countUnsynced(phone.db)).toBe(1)
    expect(await phone.live()).toEqual(['Before', 'Made after the sign-in ended'])

    expect(await phone.signIn(changed)).toBe('ok')
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(await superuser.collection('items').getOne(waiting.id)).toMatchObject({ title: 'Made after the sign-in ended' })
  })

  it('a wrong password is told apart from a backend that gives no answer', async () => {
    const { email } = await account()
    const db = openDb(`backend-test-${Date.now()}-${++n}`)
    dbs.push(db)
    const auth = createAuth({ client: new PocketBase(URL), db, storage: memoryStorage() })
    expect(await patiently(() => auth.signIn(email, 'not the password'), (r) => r === 'failed')).toBe('wrong')
    const nowhere = createAuth({ client: new PocketBase('http://127.0.0.1:9'), db, storage: memoryStorage() })
    expect(await nowhere.signIn(email, PASSWORD)).toBe('no-connection')
  })
})
