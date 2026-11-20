import { afterEach, describe, expect, it } from 'vitest'
import { ITEM_STATUSES, openDb } from '../db/db'
import { createItem } from '../db/write'
import { buildDemoItems, seedIfEmpty } from './demo'

const db = openDb('seed-test')

afterEach(async () => {
  await db.items.clear()
  await db.outbox.clear()
})

describe('the demo data', () => {
  it('shows every status, with a unique slug each', () => {
    const items = buildDemoItems()
    expect(new Set(items.map((i) => i.status))).toEqual(new Set(ITEM_STATUSES))
    expect(new Set(items.map((i) => i.slug)).size).toBe(items.length)
  })

  it('fills an empty database once, without queueing anything', async () => {
    expect(await seedIfEmpty(db)).toBe(true)
    expect(await seedIfEmpty(db)).toBe(false)
    expect(await db.items.count()).toBe(buildDemoItems().length)
    expect(await db.outbox.count()).toBe(0)
  })

  it('leaves a database with data alone', async () => {
    await createItem({ title: 'Mine' }, db)
    expect(await seedIfEmpty(db)).toBe(false)
    expect(await db.items.count()).toBe(1)
  })
})
