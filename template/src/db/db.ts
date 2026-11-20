import Dexie, { type EntityTable } from 'dexie'

// D-0002: the device keeps the full copy. Every record carries `updatedAt` (for
// last-write-wins once sync exists) and `deletedAt` (a tombstone, null while alive).
// Changes are written through `write.ts`, which adds an outbox row in the same transaction.
// Reads are plain Dexie queries; filter out `deletedAt !== null`.
//
// Once a version has shipped, change the schema only by adding a new version with an
// upgrade that keeps existing data.

export const ITEM_STATUSES = ['open', 'doing', 'done'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export interface Item {
  /** Internal id. Never shown to a user, in an address or elsewhere (G-0021). */
  id: string
  title: string
  note: string
  status: ItemStatus
  /** The item's address, /items/<slug> (D-0005): made from the title, unique on this device. */
  slug: string
  /** Slugs it had before a rename; their addresses still lead here (D-0005). */
  oldSlugs: string[]
  createdAt: string
  /** ISO time of the last change. */
  updatedAt: string
  /** Tombstone: ISO time of the delete, null while alive. */
  deletedAt: string | null
}

/** The tables that will sync. Add a table here when you add one to the schema. */
export type SyncedTable = 'items'
export type OutboxOp = 'put' | 'delete'

/** One local change the backend hasn't confirmed yet. */
export interface OutboxItem {
  /** Auto-increment: the order changes were made in. */
  id?: number
  table: SyncedTable
  recordId: string
  op: OutboxOp
  queuedAt: string
}

export type AppDb = Dexie & {
  items: EntityTable<Item, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
}

export const SCHEMA_V1 = {
  items: 'id, status, updatedAt, slug, *oldSlugs',
  outbox: '++id, [table+recordId]',
} as const

export function openDb(name = '__PROJECT_NAME__'): AppDb {
  const db = new Dexie(name) as AppDb
  db.version(1).stores(SCHEMA_V1)
  return db
}

export const db = openDb()
