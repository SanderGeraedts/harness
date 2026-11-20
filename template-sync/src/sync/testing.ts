import { readFileSync } from 'node:fs'
import type { RecordApi, SyncAuth, SyncClient } from './engine'
import type { ServerRecord } from './records'

// Test helpers for src/sync and src/auth. Not imported by the app.
//
// A fake backend that behaves like backend/ on the points sync relies on: records keep the
// id they are made with, only their owner reads and writes them (404 for anyone else),
// `updated` is set on every save, an older `updatedAt` is answered with the stored record
// (pb_hooks/newest_wins.pb.js), and slugs are settled per owner with the backend's own rule
// (pb_hooks/slug.js, loaded from the file). Requests can be made to fail.

/** An error as the backend's client throws it; status 0 means there was no answer. */
export function responseError(status: number): Error & { status: number } {
  return Object.assign(new Error(`the backend answered ${status}`), { status })
}

interface SlugRule {
  slugify(title: string): string
  settle(
    incoming: { title: string; slug: unknown; oldSlugs: unknown },
    stored: { slug: unknown; oldSlugs: unknown } | null,
    others: { slug: unknown; oldSlugs: unknown }[],
  ): { slug: string; oldSlugs: string[] }
}

/** The backend's slug rule, from the file its hook loads. */
export function backendSlugRule(): SlugRule {
  const source = readFileSync(new URL('../../backend/pb_hooks/slug.js', import.meta.url), 'utf8')
  const module = { exports: {} as SlugRule }
  new Function('module', source)(module)
  return module.exports
}

export type Operation = 'getList' | 'create' | 'update'

/** Return an error to fail a request, or nothing to let it through. */
export type Interceptor = (op: Operation, collection: string, id?: string) => Error | void

const clone = <T>(value: T): T => structuredClone(value)
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export class FakeBackend {
  readonly records = new Map<string, Map<string, ServerRecord>>()
  readonly requests: { op: Operation; collection: string; id?: string }[] = []
  interceptor: Interceptor | null = null
  private readonly rule = backendSlugRule()
  private clock = Date.parse('2026-01-02T10:00:00.000Z')

  constructor(collections: readonly string[] = ['items']) {
    for (const name of collections) this.records.set(name, new Map())
  }

  private now(): string {
    this.clock += 1
    return new Date(this.clock).toISOString().replace('T', ' ')
  }

  private table(name: string): Map<string, ServerRecord> {
    const table = this.records.get(name)
    if (!table) throw responseError(404)
    return table
  }

  all(collection: string): ServerRecord[] {
    return [...this.table(collection).values()].map(clone)
  }

  get(collection: string, id: string): ServerRecord | undefined {
    const record = this.table(collection).get(id)
    return record && clone(record)
  }

  private settleSlug(collection: string, record: ServerRecord, stored: ServerRecord | undefined): void {
    const others = [...this.table(collection).values()].filter((r) => r.owner === record.owner && r.id !== record.id)
    const next = this.rule.settle(
      { title: String(record.title ?? ''), slug: record.slug, oldSlugs: record.oldSlugs },
      stored ? { slug: stored.slug, oldSlugs: stored.oldSlugs } : null,
      others.map((r) => ({ slug: r.slug, oldSlugs: r.oldSlugs })),
    )
    record.slug = next.slug
    record.oldSlugs = next.oldSlugs
  }

  /** A client signed in as `userId`. Set `signedIn = false` on it: the backend then sees a visitor. */
  client(userId = 'u1'): SyncClient & { signedIn: boolean } {
    const server = this
    const client = {
      signedIn: true,
      authStore: { record: { id: userId } as { id: string } | null },
      collection(name: string): RecordApi {
        const check = (op: Operation, id?: string) => {
          server.requests.push({ op, collection: name, id })
          const err = server.interceptor?.(op, name, id)
          if (err) throw err
        }
        const me = () => (client.signedIn ? userId : '')
        return {
          async getList(_page, perPage, options = {}) {
            check('getList')
            const filter = String(options.filter ?? '')
            const visible = [...server.table(name).values()].filter((r) => r.owner === me() && matches(r, filter))
            visible.sort((a, b) => (a.updated === b.updated ? cmp(a.id, b.id) : cmp(a.updated, b.updated)))
            return { items: visible.slice(0, perPage).map(clone) }
          },
          async create(body) {
            check('create', String(body.id))
            const table = server.table(name)
            const id = String(body.id)
            if (table.has(id) || me() === '' || body.owner !== me()) throw responseError(400)
            const record = { ...clone(body), id, updated: server.now() } as ServerRecord
            server.settleSlug(name, record, undefined)
            table.set(id, record)
            return clone(record)
          },
          async update(id, body) {
            check('update', id)
            const table = server.table(name)
            const stored = table.get(id)
            if (!stored || stored.owner !== me()) throw responseError(404)
            const older = typeof body.updatedAt === 'string' && Date.parse(body.updatedAt) < Date.parse(String(stored.updatedAt))
            if (older) return clone(stored) // newest_wins.pb.js
            const record = { ...stored, ...clone(body), id, updated: server.now() }
            server.settleSlug(name, record, stored)
            table.set(id, record)
            return clone(record)
          },
        }
      },
    }
    return client
  }
}

/** The filters the engine sends: its owner's records, since a time or after a place in the list. */
function matches(record: ServerRecord, filter: string): boolean {
  const owner = /^owner = "([^"]*)"(?: && (.*))?$/.exec(filter)
  if (!owner) throw new Error(`the engine must ask for its owner's records only, not: ${filter}`)
  if (record.owner !== owner[1]) return false
  const rest = owner[2] ?? ''
  if (rest === '') return true
  const since = /^updated >= "([^"]*)"$/.exec(rest)
  if (since) return record.updated >= since[1]!
  const after = /^\(updated > "([^"]*)" \|\| \(updated = "([^"]*)" && id > "([^"]*)"\)\)$/.exec(rest)
  if (after) return record.updated > after[1]! || (record.updated === after[2]! && record.id > after[3]!)
  throw new Error(`the fake backend can't read the filter: ${filter}`)
}

/**
 * A sign-in that is good until told otherwise. `renew` answers like the backend: once the
 * client is no longer signed in, the sign-in has ended.
 */
export function fakeAuth(client?: { signedIn: boolean }) {
  let state: ReturnType<SyncAuth['state']> = 'signed-in'
  const listeners = new Set<() => void>()
  const auth = {
    renewals: 0,
    state: () => state,
    end() {
      auth.set('ended')
    },
    async renew() {
      auth.renewals++
      if (client && !client.signedIn && state === 'signed-in') auth.set('ended')
      return state
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    set(next: ReturnType<SyncAuth['state']>) {
      state = next
      if (client && next === 'signed-in') client.signedIn = true
      for (const listener of [...listeners]) listener()
    },
  }
  return auth
}
