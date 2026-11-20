import { AccentHeading, Button, Card, Field, inputClass, linkClass, StatusBadge } from '../components/ui'
import { ITEM_STATUSES } from '../db/db'
import { t } from '../text'

// D-0003: every token and component on one page, in the device's colour scheme. Not in
// production builds (router.tsx). When you add a component, show it here.

const COLOURS = ['bg-text', 'bg-bg', 'bg-muted', 'bg-line', 'bg-surface', 'bg-accent', 'bg-on-accent'] as const

export function DesignPage() {
  return (
    <section className="grid gap-8">
      <div>
        <AccentHeading>{t.design}</AccentHeading>
        <p className="text-muted">{t.designIntro}</p>
      </div>

      <div>
        <AccentHeading level={2}>{t.colours}</AccentHeading>
        <ul className="mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
          {COLOURS.map((c) => (
            <li key={c} className="text-sm">
              <span className={`block h-12 rounded-card border border-line ${c}`} />
              {c.replace('bg-', '')}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <AccentHeading level={2}>{t.type}</AccentHeading>
        <p className="mt-4 mb-1 text-2xl font-semibold">{t.appTitle}</p>
        <p className="m-0 text-lg font-semibold">{t.items}</p>
        <p className="m-0">{t.designIntro}</p>
        <p className="m-0 text-sm text-muted">{t.noteHint}</p>
        <p className="mb-0">
          <a href="/design" className={linkClass}>
            {t.design}
          </a>
        </p>
      </div>

      <div>
        <AccentHeading level={2}>{t.components}</AccentHeading>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button>{t.save}</Button>
          <Button variant="secondary">{t.cancel}</Button>
          <Button variant="danger">{t.deleteConfirm}</Button>
          <Button disabled>{t.save}</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ITEM_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="mt-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h3 className="m-0 text-lg font-semibold">{t.title}</h3>
              <StatusBadge status="doing" />
            </div>
            <p className="mt-1 mb-0 text-muted">{t.note}</p>
          </Card>
        </div>
        <div className="mt-4">
          <Field label={t.title} htmlFor="design-title" hint={t.noteHint}>
            <input id="design-title" className={inputClass} defaultValue={t.newItem} />
          </Field>
        </div>
      </div>
    </section>
  )
}
