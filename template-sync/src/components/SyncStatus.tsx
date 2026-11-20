import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { db } from '../db/db'
import { syncApp, useAuthState, useOnline, useStorageProtected, useSyncStatus } from '../sync/app'
import { formatWhen, syncErrorText, syncLine, syncSummary, type SyncView } from '../sync/line'
import { t } from '../text'
import { bandClass, Button } from './ui'

// The sync status: one band under the header, where the demo band is in other builds. Its
// one line is a button that opens the details; the rules for the line are in
// src/sync/line.ts. `SyncStatusView` shows a given state (also on /design); `SyncStatus`
// gathers the state of this device.

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <dt className="font-semibold">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  )
}

export function SyncStatusView({
  view,
  onSyncNow,
  initiallyOpen = false,
}: {
  view: SyncView
  onSyncNow: () => void
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const detailsId = useId()
  const lineRef = useRef<HTMLButtonElement>(null)
  const line = syncLine(view)
  const language = typeof document === 'undefined' ? undefined : document.documentElement.lang

  // A screen reader hears the line when its rule changes, without the count: saving ten
  // items is not read out ten times. Nothing is said when the page first shows.
  const [announcement, setAnnouncement] = useState('')
  const rule = useRef(line.rule)
  useEffect(() => {
    if (rule.current === line.rule) return
    rule.current = line.rule
    setAnnouncement(line.announcement ?? '')
  }, [line.rule, line.announcement])

  // Escape closes the details, from the line and from inside them; the focus goes to the line.
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return
    setOpen(false)
    lineRef.current?.focus()
  }

  return (
    <section aria-label={t.sync} className="bg-surface text-sm" onKeyDown={closeOnEscape}>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {line.rule === 'sign-in' ? (
        // Nothing to open: the one thing to do is to sign in again.
        <Link to="/account" className={`${bandClass} block text-text underline decoration-accent decoration-2 underline-offset-4`}>
          {line.text}
        </Link>
      ) : (
        <button
          ref={lineRef}
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className={`${bandClass} block w-full cursor-pointer text-left text-text`}
        >
          {line.text}
        </button>
      )}
      {line.rule !== 'sign-in' && open && (
        <div id={detailsId} className="border-t border-line px-4 pt-3 pb-4">
          <dl className="m-0">
            <Detail label={t.syncStatusLabel}>{syncSummary(view)}</Detail>
            <Detail label={t.syncLast}>{view.lastSyncedAt ? formatWhen(view.lastSyncedAt, language) : t.syncNever}</Detail>
            {view.lastError && (
              <Detail label={t.syncLastError}>
                <span className="block">{syncErrorText(view.lastError)}</span>
                {view.lastErrorAt && <span className="block text-muted">{formatWhen(view.lastErrorAt, language)}</span>}
              </Detail>
            )}
          </dl>
          {view.offline && <p className="mb-2">{t.syncOfflineDetail}</p>}
          {view.storageRefused && <p className="mb-2">{t.syncStorageDetail}</p>}
          <Button className="mt-2" disabled={view.running || view.offline} onClick={onSyncNow}>
            {view.running ? t.syncing : t.syncNow}
          </Button>
        </div>
      )}
    </section>
  )
}

/** The sync status of this device. Shown only while an account owns its data. */
export function SyncStatus() {
  const authState = useAuthState()
  const status = useSyncStatus()
  const online = useOnline()
  const storageProtected = useStorageProtected()
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  if (!status) return null
  return (
    <SyncStatusView
      view={{
        ended: authState === 'ended',
        offline: !online,
        pending,
        storageRefused: storageProtected === false,
        running: status.running,
        lastSyncedAt: status.lastSyncedAt,
        lastError: status.lastError,
        lastErrorAt: status.lastErrorAt,
      }}
      onSyncNow={() => void syncApp()?.engine.syncNow()}
    />
  )
}
