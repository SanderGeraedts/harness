import { db as defaultDb, ITEM_STATUSES, NOTE_MAX, TITLE_MAX, type AppDb, type Item, type ItemStatus, type OutboxOp, type SyncedTable } from './db'
import { renamedSlugs, slugify, slugsOf, uniqueSlug } from './slug'

// The one write API every screen uses (D-0002). Each call validates its input, stamps
// `updatedAt`, and writes the record and its outbox row in one transaction, so a write that
// fails leaves neither. Every change adds its own outbox row; rows are never collapsed or
// dropped here, only by the sync engine once the backend confirms.
//
// Never write to a synced table from a screen directly: the change would not sync.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(message: string): never {
  throw new ValidationError(message)
}

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') fail('An item needs a title.')
  if (title.trim().length > TITLE_MAX) fail(`A title has ${TITLE_MAX} characters at most.`)
  return title.trim()
}

function checkNote(note: unknown): string {
  if (typeof note !== 'string') fail('The note must be text.')
  if (note.length > NOTE_MAX) fail(`A note has ${NOTE_MAX} characters at most.`)
  return note
}

function checkStatus(status: unknown): ItemStatus {
  if (!ITEM_STATUSES.includes(status as ItemStatus)) fail(`Unknown status: ${String(status)}`)
  return status as ItemStatus
}

async function queue(target: AppDb, table: SyncedTable, recordId: string, op: OutboxOp, queuedAt: string) {
  await target.outbox.add({ table, recordId, op, queuedAt })
}

async function liveItem(target: AppDb, id: string): Promise<Item> {
  const item = await target.items.get(id)
  if (!item || item.deletedAt !== null) fail('That item no longer exists.')
  return item
}

/**
 * Every slug the other items on this device hold, current and earlier, deleted ones
 * included (D-0005). Call inside a transaction that reads items.
 */
async function takenSlugs(target: AppDb, exceptId: string): Promise<Set<string>> {
  const items = await target.items.toArray()
  return new Set(items.filter((i) => i.id !== exceptId).flatMap(slugsOf))
}

export interface NewItem {
  title: string
  note?: string
  status?: ItemStatus
}

export async function createItem(input: NewItem, target: AppDb = defaultDb): Promise<Item> {
  const time = now()
  const item: Item = {
    id: newId(),
    title: checkTitle(input.title),
    note: checkNote(input.note ?? ''),
    status: checkStatus(input.status ?? 'open'),
    slug: '',
    oldSlugs: [],
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
  }
  await target.transaction('rw', target.items, target.outbox, async () => {
    item.slug = uniqueSlug(slugify(item.title), await takenSlugs(target, item.id))
    await target.items.add(item)
    await queue(target, 'items', item.id, 'put', time)
  })
  return item
}

export type ItemChanges = Partial<Pick<Item, 'title' | 'note' | 'status'>>

export async function updateItem(id: string, changes: ItemChanges, target: AppDb = defaultDb): Promise<Item> {
  const patch: ItemChanges = {}
  if ('title' in changes) patch.title = checkTitle(changes.title)
  if ('note' in changes) patch.note = checkNote(changes.note)
  if ('status' in changes) patch.status = checkStatus(changes.status)
  const time = now()
  return target.transaction('rw', target.items, target.outbox, async () => {
    const item = await liveItem(target, id)
    const updated: Item = { ...item, ...patch, updatedAt: time }
    // D-0005: a new title can mean a new slug; the old one is kept in oldSlugs.
    if (patch.title !== undefined) Object.assign(updated, renamedSlugs(item, patch.title, await takenSlugs(target, id)))
    await target.items.put(updated)
    await queue(target, 'items', id, 'put', time)
    return updated
  })
}

/**
 * Deletes an item by setting its tombstone and queueing the delete. The record stays, so the
 * delete can sync and the slug is never handed to another item.
 */
export async function deleteItem(id: string, target: AppDb = defaultDb): Promise<void> {
  const time = now()
  await target.transaction('rw', target.items, target.outbox, async () => {
    await liveItem(target, id)
    await target.items.update(id, { deletedAt: time, updatedAt: time })
    await queue(target, 'items', id, 'delete', time)
  })
}

/** Changes on this device the backend hasn't confirmed yet. */
export function countUnsynced(target: AppDb = defaultDb): Promise<number> {
  return target.outbox.count()
}
