import { useLocation, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db, type Item } from '../db/db'

// D-0005 (G-0021): pages find their item by the slug in the address. An earlier slug finds
// it too; the page then moves to the current address, replacing the old one in the history.

/** The live item at `slug`, or the live item that had it before a rename; null when none. */
export async function findItem(slug: string): Promise<Item | null> {
  const current = await db.items.where('slug').equals(slug).first()
  if (current) return current.deletedAt === null ? current : null
  const moved = await db.items.where('oldSlugs').equals(slug).toArray()
  return moved.find((i) => i.deletedAt === null) ?? null
}

/** `findItem`, live: undefined while loading. */
export function useItemBySlug(slug: string): Item | null | undefined {
  return useLiveQuery(() => findItem(slug), [slug])
}

/** Replaces the address with the same one at the item's current slug. */
export function SlugRedirect({ slug }: { slug: string }) {
  const router = useRouter()
  const { pathname } = useLocation()
  const href = pathname.replace(/^\/items\/[^/]+/, `/items/${encodeURIComponent(slug)}`)
  useEffect(() => {
    router.history.replace(href)
  }, [router, href])
  return null
}
