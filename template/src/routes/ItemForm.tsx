import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { AccentHeading, Button, Field, inputClass } from '../components/ui'
import { ITEM_STATUSES, type ItemStatus } from '../db/db'
import { createItem, updateItem } from '../db/write'
import { t } from '../text'
import { SlugRedirect, useItemBySlug } from './itemBySlug'
import { backLinkClass } from './ItemPage'
import { NotFound } from './NotFound'

// One form to add an item and to edit it. Writes go through the write API (D-0002).

export interface ItemFields {
  title: string
  note: string
  status: ItemStatus
}

export function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ItemFields
  onSave: (fields: ItemFields) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [note, setNote] = useState(initial.note)
  const [status, setStatus] = useState<ItemStatus>(initial.status)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (title.trim() === '') {
      setError(t.titleMissing)
      return
    }
    setSaving(true)
    try {
      await onSave({ title, note, status })
    } catch {
      setError(t.saveFailed)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Field label={t.title} htmlFor="item-title">
        <input id="item-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t.note} htmlFor="item-note" hint={t.noteHint}>
        <textarea id="item-note" className={inputClass} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={t.status} htmlFor="item-status">
        <select id="item-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.statuses[s]}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {t.save}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </form>
  )
}

export function NewItemPage() {
  const navigate = useNavigate()
  return (
    <section>
      <Link to="/" className={backLinkClass}>
        ← {t.backToItems}
      </Link>
      <div className="mb-5">
        <AccentHeading>{t.newItem}</AccentHeading>
      </div>
      <ItemForm
        initial={{ title: '', note: '', status: 'open' }}
        onCancel={() => void navigate({ to: '/' })}
        onSave={async (fields) => {
          const item = await createItem(fields)
          await navigate({ to: '/items/$slug', params: { slug: item.slug }, replace: true })
        }}
      />
    </section>
  )
}

export function EditItemPage() {
  const { slug } = useParams({ from: '/items/$slug/edit' })
  const item = useItemBySlug(slug)
  const navigate = useNavigate()

  if (item === undefined) return null
  if (item === null) return <NotFound />
  if (item.slug !== slug) return <SlugRedirect slug={item.slug} />

  return (
    <section>
      <Link to="/items/$slug" params={{ slug }} className={backLinkClass}>
        ← {item.title}
      </Link>
      <div className="mb-5">
        <AccentHeading>{t.editItem}</AccentHeading>
      </div>
      <ItemForm
        initial={{ title: item.title, note: item.note, status: item.status }}
        onCancel={() => void navigate({ to: '/items/$slug', params: { slug } })}
        onSave={async (fields) => {
          const updated = await updateItem(item.id, fields)
          await navigate({ to: '/items/$slug', params: { slug: updated.slug }, replace: true })
        }}
      />
    </section>
  )
}
