import { ITEM_STATUSES, type Item, type ItemStatus, type SyncedTable } from '../db/db'

// How a record on the device (src/db/db.ts) maps to its record on the backend
// (backend/pb_migrations/). A record keeps the id its device gave it, on the backend too.
// On the backend an empty text field is "", on the device `deletedAt` is null.
//
// Add a table: add it to SYNCED_TABLES, and give `toServer` and `fromServer` its case.

/** A record as the backend returns it. `updated` is the backend's own time of the last save. */
export interface ServerRecord {
  id: string
  updated: string
  [field: string]: unknown
}

/** A record of any synced table, as the device keeps it. */
export type LocalRecord = Item

/** The order tables are pulled in. A table that others point to comes first. */
export const SYNCED_TABLES: readonly SyncedTable[] = ['items']

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const isSlug = (value: unknown): value is string => typeof value === 'string' && SLUG.test(value)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const orNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const slugList = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isSlug) : [])

/** The fields sent to the backend for a record; never `owner`, which is set once, on create. */
export function toServer(table: SyncedTable, record: LocalRecord): Record<string, unknown> {
  switch (table) {
    case 'items':
      return {
        title: record.title,
        note: record.note,
        status: record.status,
        // D-0005: the device's choice; the backend may change it (backend/pb_hooks/slugs.pb.js).
        slug: record.slug,
        oldSlugs: record.oldSlugs,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt ?? '',
      }
  }
}

/** The record the device keeps for one the backend sent. */
export function fromServer(table: SyncedTable, r: ServerRecord): LocalRecord {
  switch (table) {
    case 'items':
      return {
        id: r.id,
        title: text(r.title),
        note: text(r.note),
        status: ITEM_STATUSES.includes(r.status as ItemStatus) ? (r.status as ItemStatus) : 'open',
        slug: isSlug(r.slug) ? r.slug : '',
        oldSlugs: slugList(r.oldSlugs),
        createdAt: text(r.createdAt),
        updatedAt: text(r.updatedAt),
        deletedAt: orNull(r.deletedAt),
      }
  }
}

/**
 * The slug and earlier slugs as the backend has them, or null when it sent none. The backend
 * settles slugs without a new `updatedAt` (D-0005), so a device takes these over whenever it
 * has no change of its own waiting, whatever the times say.
 */
export function serverSlugs(r: ServerRecord): { slug: string; oldSlugs: string[] } | null {
  return isSlug(r.slug) ? { slug: r.slug, oldSlugs: slugList(r.oldSlugs) } : null
}

/**
 * Newest wins (D-0007): true when `incoming` was changed strictly later than `local`. An
 * equal time is the same version: a record coming back after its own push.
 */
export function isNewer(incoming: string, local: string): boolean {
  const a = Date.parse(incoming)
  const b = Date.parse(local)
  if (Number.isNaN(a)) return false
  if (Number.isNaN(b)) return true
  return a > b
}
