import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { AccentHeading, Button, buttonClass, StatusBadge } from '../components/ui'
import { deleteItem } from '../db/write'
import { t } from '../text'
import { SlugRedirect, useItemBySlug } from './itemBySlug'
import { NotFound } from './NotFound'

export const backLinkClass = 'mb-3 inline-block text-sm text-muted no-underline hover:text-text'

export function ItemPage() {
  const { slug } = useParams({ from: '/items/$slug' })
  const item = useItemBySlug(slug)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (item === undefined) return null
  if (item === null) return <NotFound />
  if (item.slug !== slug) return <SlugRedirect slug={item.slug} />

  const remove = async () => {
    await deleteItem(item.id)
    await navigate({ to: '/', replace: true })
  }

  return (
    <article>
      <Link to="/" className={backLinkClass}>
        ← {t.backToItems}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <AccentHeading>{item.title}</AccentHeading>
        <StatusBadge status={item.status} />
      </div>
      {item.note && <p className="mt-5 whitespace-pre-wrap">{item.note}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {confirming ? (
          <div role="group" aria-label={t.deleteQuestion} className="flex flex-wrap items-center gap-3">
            <span>{t.deleteQuestion}</span>
            <Button variant="danger" onClick={() => void remove()}>
              {t.deleteConfirm}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        ) : (
          <>
            <Link to="/items/$slug/edit" params={{ slug: item.slug }} className={buttonClass()}>
              {t.edit}
            </Link>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t.delete}
            </Button>
          </>
        )}
      </div>
    </article>
  )
}
