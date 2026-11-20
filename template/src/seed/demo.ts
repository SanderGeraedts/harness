import type { AppDb, Item, ItemStatus } from '../db/db'
import { slugify } from '../db/slug'

// G-0019: previews and local development start with these demo items. Keep them good enough
// to show every screen and every status; never put real data here.

const DEMO: { title: string; note: string; status: ItemStatus }[] = [
  { title: 'Water the plants', note: 'The fern by the window dries out first.', status: 'open' },
  { title: 'Plan the weekend trip', note: 'Check the train times.\nBook a table for Saturday.', status: 'doing' },
  { title: 'Return the library books', note: '', status: 'done' },
]

const SEED_TIME = '2026-01-01T09:00:00.000Z'

export function buildDemoItems(): Item[] {
  return DEMO.map((d, i) => ({
    // Fixed ids, so the demo data is the same on every device.
    id: `demo-${i + 1}`,
    title: d.title,
    note: d.note,
    status: d.status,
    slug: slugify(d.title),
    oldSlugs: [],
    createdAt: SEED_TIME,
    // One second apart, so the list has a steady order.
    updatedAt: new Date(Date.parse(SEED_TIME) - i * 1000).toISOString(),
    deletedAt: null,
  }))
}

/**
 * Fills an empty database with the demo items, and leaves a database with data alone. Writes
 * the records directly, without outbox rows: demo data never syncs.
 */
export async function seedIfEmpty(db: AppDb): Promise<boolean> {
  return db.transaction('rw', db.items, async () => {
    if ((await db.items.count()) > 0) return false
    await db.items.bulkAdd(buildDemoItems())
    return true
  })
}
