import { SignInForm } from '../auth/SignInForm'
import { SignOut } from '../auth/SignOut'
import { SyncStatusView } from '../components/SyncStatus'
import { AccentHeading, Band, Button, Card, Field, inputClass, linkClass, StatusBadge } from '../components/ui'
import { ITEM_STATUSES } from '../db/db'
import type { SyncView } from '../sync/line'
import { t } from '../text'

// D-0003: every token and component on one page, in the device's colour scheme. Not in
// production builds (router.tsx). When you add a component, show it here, in each of its
// states, from fixed sample values: nothing on this page reaches a backend.

const COLOURS = ['bg-text', 'bg-bg', 'bg-muted', 'bg-line', 'bg-surface', 'bg-accent', 'bg-on-accent'] as const

const SAMPLE_TIME = '2026-01-02T09:30:00.000Z'
const SAMPLE_EMAIL = 'someone@example.com'
/** As long as an e-mail gets, without a place to break. */
const LONG_EMAIL = `${'a'.repeat(47)}@example.com`

const synced: SyncView = {
  ended: false,
  offline: false,
  pending: 0,
  storageRefused: false,
  running: false,
  lastSyncedAt: SAMPLE_TIME,
  lastError: null,
  lastErrorAt: null,
}

/** The sync status in each of its states: the six lines, the counts, and the details open. */
const SYNC_SAMPLES: { view: SyncView; open?: boolean }[] = [
  { view: synced },
  { view: { ...synced, pending: 1 } },
  { view: { ...synced, pending: 1234 } },
  { view: { ...synced, offline: true } },
  { view: { ...synced, offline: true, pending: 3 } },
  { view: { ...synced, lastError: 'other', lastErrorAt: SAMPLE_TIME } },
  { view: { ...synced, lastError: 'no-connection', lastErrorAt: SAMPLE_TIME, pending: 3 } },
  { view: { ...synced, storageRefused: true } },
  { view: { ...synced, ended: true } },
  { view: { ...synced, ended: true, pending: 3 } },
  { view: { ...synced, lastSyncedAt: null, offline: true, storageRefused: true, pending: 3, lastError: 'no-connection', lastErrorAt: SAMPLE_TIME }, open: true },
  { view: { ...synced, running: true, pending: 1234 }, open: true },
]

const stay = async () => 'failed' as const
const keep = async () => ({ done: false as const, unsynced: 3 })

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
              <h3 className="m-0 min-w-0 text-lg font-semibold">{t.title}</h3>
              <StatusBadge status="doing" />
            </div>
            <p className="mt-1 mb-0 text-muted">{t.note}</p>
          </Card>
        </div>
        <div className="mt-4 grid gap-2">
          <Band>{t.demoBanner}</Band>
          <Band>{t.offlineOnly}</Band>
        </div>
        <div className="mt-4">
          <Field label={t.title} htmlFor="design-title" hint={t.noteHint}>
            <input id="design-title" className={inputClass} defaultValue={t.newItem} />
          </Field>
        </div>
      </div>

      <div>
        <AccentHeading level={2}>{t.designSync}</AccentHeading>
        <div className="mt-4 grid gap-2">
          {SYNC_SAMPLES.map((sample, i) => (
            <SyncStatusView key={i} view={sample.view} initiallyOpen={sample.open} onSyncNow={() => {}} />
          ))}
        </div>
      </div>

      <div>
        <AccentHeading level={2}>{t.designSignIn}</AccentHeading>
        <div className="mt-4 grid gap-8">
          <SignInForm onSignIn={stay} />
          <SignInForm onSignIn={stay} initial={{ email: SAMPLE_EMAIL, error: t.signInWrong }} />
          <SignInForm onSignIn={stay} initial={{ email: SAMPLE_EMAIL, password: 'password', busy: true }} />
          <SignInForm onSignIn={stay} lockedEmail={LONG_EMAIL} />
        </div>
      </div>

      <div>
        <AccentHeading level={2}>{t.designSignOut}</AccentHeading>
        <div className="mt-4 grid gap-8">
          <div>
            <p className="mb-4">{t.signedInAs(LONG_EMAIL)}</p>
            <SignOut onSignOut={keep} hint={t.signOutHint} variant="danger" />
          </div>
          <SignOut onSignOut={keep} hint={t.otherAccount} variant="secondary" />
          <SignOut onSignOut={keep} hint={t.signOutHint} variant="danger" initial={{ unsynced: 1 }} />
          <SignOut onSignOut={keep} hint={t.signOutHint} variant="danger" initial={{ unsynced: 1234 }} />
          <Card>{t.signInEnded}</Card>
          <Card>{t.signInOffline}</Card>
        </div>
      </div>
    </section>
  )
}
