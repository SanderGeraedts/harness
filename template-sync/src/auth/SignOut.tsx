import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui'
import { t } from '../text'
import type { SignOutResult } from './auth'

// Signing out: a line that says what it does, the button, and, when changes haven't synced,
// the question in its place (D-0009). Signing out is the only thing that clears the device,
// so with changes waiting it asks first and names their number.

export function SignOut({
  onSignOut,
  hint,
  variant,
  initial = {},
}: {
  /** Signs out. Without `force` it clears nothing while changes wait, and says how many. */
  onSignOut: (options: { force: boolean }) => Promise<SignOutResult>
  /** The muted line above the button. */
  hint: string
  variant: 'danger' | 'secondary'
  /** A state to start in, for /design. */
  initial?: { unsynced?: number }
}) {
  const [busy, setBusy] = useState(false)
  const [unsynced, setUnsynced] = useState<number | null>(initial.unsynced ?? null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const signOutRef = useRef<HTMLButtonElement>(null)
  // The question appeared: the focus goes to the safe answer. Back at rest after "Cancel":
  // it returns to the button. Not on /design, where the state is only shown.
  const asked = useRef(false)
  useEffect(() => {
    if (unsynced !== null && initial.unsynced === undefined) {
      asked.current = true
      cancelRef.current?.focus()
    } else if (unsynced === null && asked.current) {
      asked.current = false
      signOutRef.current?.focus()
    }
  }, [unsynced, initial.unsynced])

  const signOut = async (force: boolean) => {
    setBusy(true)
    const result = await onSignOut({ force })
    setBusy(false)
    if (!result.done) setUnsynced(result.unsynced)
  }

  if (unsynced !== null) {
    return (
      <div role="alert">
        <p className="mb-4 font-semibold">{t.signOutUnsynced(unsynced)}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" disabled={busy} onClick={() => void signOut(true)}>
            {t.signOutAnyway}
          </Button>
          <Button ref={cancelRef} variant="secondary" disabled={busy} onClick={() => setUnsynced(null)}>
            {t.cancel}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-muted">{hint}</p>
      <Button ref={signOutRef} variant={variant} disabled={busy} onClick={() => void signOut(false)}>
        {busy ? t.signingOut : t.signOut}
      </Button>
    </div>
  )
}
