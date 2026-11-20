import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NOTE_MAX, openDb, TITLE_MAX, type AppDb } from './db'
import { countUnsynced, createItem, deleteItem, updateItem, ValidationError } from './write'

let db: AppDb
let n = 0

beforeEach(() => {
  db = openDb(`write-test-${++n}`)
})

afterEach(async () => {
  await db.delete()
})

const outbox = () => db.outbox.orderBy('id').toArray()

describe('createItem', () => {
  it('stores the item with its slug, times and no tombstone, and queues it', async () => {
    const item = await createItem({ title: '  Buy oat milk ', note: 'Two cartons.' }, db)
    expect(item).toMatchObject({ title: 'Buy oat milk', note: 'Two cartons.', status: 'open', slug: 'buy-oat-milk', oldSlugs: [], deletedAt: null })
    expect(item.updatedAt).toBe(item.createdAt)
    expect(await db.items.get(item.id)).toEqual(item)
    expect(await outbox()).toMatchObject([{ table: 'items', recordId: item.id, op: 'put', queuedAt: item.updatedAt }])
  })

  it('refuses a title or a note longer than the limits, and takes one exactly as long', async () => {
    await expect(createItem({ title: 't'.repeat(TITLE_MAX + 1) }, db)).rejects.toThrow(ValidationError)
    await expect(createItem({ title: 'Tea', note: 'n'.repeat(NOTE_MAX + 1) }, db)).rejects.toThrow(ValidationError)
    expect(await db.items.count()).toBe(0)
    expect(await outbox()).toEqual([])
    const item = await createItem({ title: ` ${'t'.repeat(TITLE_MAX)} `, note: 'n'.repeat(NOTE_MAX) }, db)
    expect(item.title).toHaveLength(TITLE_MAX)
    await expect(updateItem(item.id, { title: 't'.repeat(TITLE_MAX + 1) }, db)).rejects.toThrow(ValidationError)
    await expect(updateItem(item.id, { note: 'n'.repeat(NOTE_MAX + 1) }, db)).rejects.toThrow(ValidationError)
    expect(await outbox()).toHaveLength(1)
  })

  it('gives two items with the same title different slugs', async () => {
    const a = await createItem({ title: 'Tea' }, db)
    const b = await createItem({ title: 'Tea' }, db)
    expect([a.slug, b.slug]).toEqual(['tea', 'tea-2'])
  })

  it('refuses bad input and writes nothing', async () => {
    await expect(createItem({ title: '   ' }, db)).rejects.toBeInstanceOf(ValidationError)
    await expect(createItem({ title: 'Tea', status: 'lost' as never }, db)).rejects.toBeInstanceOf(ValidationError)
    expect(await db.items.count()).toBe(0)
    expect(await countUnsynced(db)).toBe(0)
  })
})

describe('updateItem', () => {
  it('changes the fields given, stamps updatedAt and queues the change', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    const updated = await updateItem(item.id, { status: 'done', note: 'Green.' }, db)
    expect(updated).toMatchObject({ title: 'Tea', status: 'done', note: 'Green.', slug: 'tea' })
    expect(updated.updatedAt >= item.updatedAt).toBe(true)
    expect((await outbox()).map((o) => o.op)).toEqual(['put', 'put'])
  })

  it('gives a renamed item a new slug and keeps the old address', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    const renamed = await updateItem(item.id, { title: 'Coffee' }, db)
    expect(renamed).toMatchObject({ slug: 'coffee', oldSlugs: ['tea'] })
    // The old slug stays the first item's: a new "Tea" gets another.
    expect((await createItem({ title: 'Tea' }, db)).slug).toBe('tea-2')
  })

  it('refuses an item that is gone, and bad input', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    await expect(updateItem('nope', { title: 'x' }, db)).rejects.toBeInstanceOf(ValidationError)
    await expect(updateItem(item.id, { title: '' }, db)).rejects.toBeInstanceOf(ValidationError)
    expect(await countUnsynced(db)).toBe(1)
  })
})

describe('deleteItem', () => {
  it('sets a tombstone, keeps the record and queues the delete', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    await deleteItem(item.id, db)
    const stored = await db.items.get(item.id)
    expect(stored?.deletedAt).not.toBeNull()
    expect(stored?.updatedAt).toBe(stored?.deletedAt)
    expect((await outbox()).map((o) => o.op)).toEqual(['put', 'delete'])
  })

  it('never hands a deleted item’s slug to another', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    await deleteItem(item.id, db)
    expect((await createItem({ title: 'Tea' }, db)).slug).toBe('tea-2')
  })

  it('refuses to delete or change a deleted item', async () => {
    const item = await createItem({ title: 'Tea' }, db)
    await deleteItem(item.id, db)
    await expect(deleteItem(item.id, db)).rejects.toBeInstanceOf(ValidationError)
    await expect(updateItem(item.id, { note: 'x' }, db)).rejects.toBeInstanceOf(ValidationError)
    expect(await countUnsynced(db)).toBe(2)
  })
})
