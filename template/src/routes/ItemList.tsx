import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AccentHeading, buttonClass, Card, StatusBadge } from '../components/ui'
import { db } from '../db/db'
import { t } from '../text'

/** The live items, newest change first. Undefined while loading. */
function useItems() {
  return useLiveQuery(async () => (await db.items.orderBy('updatedAt').reverse().toArray()).filter((i) => i.deletedAt === null), [])
}

export function ItemList() {
  const items = useItems()
  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-4">
        <AccentHeading>{t.items}</AccentHeading>
        <Link to="/items/new" className={buttonClass()}>
          {t.newItem}
        </Link>
      </div>
      {items?.length === 0 && <p className="text-muted">{t.noItems}</p>}
      <ul className="m-0 grid list-none gap-3 p-0">
        {items?.map((item) => (
          <li key={item.slug}>
            <Link to="/items/$slug" params={{ slug: item.slug }} className="block text-text no-underline">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="m-0 text-lg font-semibold">{item.title}</h2>
                  <StatusBadge status={item.status} />
                </div>
                {item.note && <p className="mt-1 mb-0 truncate text-muted">{item.note}</p>}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
