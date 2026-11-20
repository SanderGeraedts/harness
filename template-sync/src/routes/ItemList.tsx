import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { firstLine } from '../components/note'
import { AccentHeading, buttonClass, Card, StatusBadge } from '../components/ui'
import { db } from '../db/db'
import { useAuthState, useSyncStatus } from '../sync/app'
import { t } from '../text'

/** The live items, newest change first. Undefined while loading. */
function useItems() {
  return useLiveQuery(async () => (await db.items.orderBy('updatedAt').reverse().toArray()).filter((i) => i.deletedAt === null), [])
}

/**
 * Whether the first sync after a sign-in is still to finish: an empty list then says it is
 * fetching, not that there is nothing. Once that sync failed, the list says what it always
 * says, and the sync status says "Sync failed".
 */
function useFetchingFirst(): boolean {
  const authState = useAuthState()
  const status = useSyncStatus()
  return authState === 'signed-in' && status !== null && status.lastSyncedAt === null && status.lastError === null
}

export function ItemList() {
  const items = useItems()
  const fetching = useFetchingFirst()
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <AccentHeading>{t.items}</AccentHeading>
        <Link to="/items/new" className={buttonClass()}>
          {t.newItem}
        </Link>
      </div>
      {items?.length === 0 && <p className="text-muted">{fetching ? t.fetchingItems : t.noItems}</p>}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0">
        {items?.map((item) => (
          <li key={item.id}>
            <Link to="/items/$slug" params={{ slug: item.slug }} className="block text-text no-underline">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="m-0 min-w-0 text-lg font-semibold">{item.title}</h2>
                  <StatusBadge status={item.status} />
                </div>
                {firstLine(item.note) && <p className="mt-1 mb-0 truncate text-muted">{firstLine(item.note)}</p>}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
