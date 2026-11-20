import { Link, Outlet } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { SyncStatus } from '../components/SyncStatus'
import { Band, linkClass } from '../components/ui'
import { deployContext, syncConfig } from '../config'
import { useAuthState } from '../sync/app'
import { t } from '../text'
import { SignInScreen } from './SignInScreen'

/** Moves the focus to the heading of the screen that just appeared; it may take a moment to render. */
function focusHeading(tries = 30): void {
  const heading = document.querySelector<HTMLElement>('main h1')
  if (heading) heading.focus()
  else if (tries > 0) requestAnimationFrame(() => focusHeading(tries - 1))
}

export function Layout() {
  // null in every build that doesn't sync: then there is no sign-in and no account.
  const authState = useAuthState()
  const signedOut = authState === 'signed-out'
  const hasAccount = authState === 'signed-in' || authState === 'ended'

  // Signing in or out changes the screen: the focus goes to the new screen's heading. A
  // sign-in that ends by itself changes no screen, and takes no focus (D-0009).
  const before = useRef(authState)
  useEffect(() => {
    const was = before.current
    before.current = authState
    if (was !== authState && (authState === 'signed-out' || authState === 'signed-in')) focusHeading()
  }, [authState])

  return (
    <>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" className="inline-block max-w-full min-w-0 text-xl font-semibold text-text no-underline">
          {t.appTitle}
          <span aria-hidden="true" className="mt-0.5 block h-1 w-full rounded-full bg-accent" />
        </Link>
        {hasAccount && (
          <Link to="/account" className={`${linkClass} mt-0.5 shrink-0 whitespace-nowrap`}>
            {t.account}
          </Link>
        )}
      </header>
      {/* G-0019: everything but production runs on demo data, and says so. */}
      {deployContext !== 'production' && <Band>{t.demoBanner}</Band>}
      {deployContext === 'production' && !syncConfig.enabled && <Band>{t.offlineOnly}</Band>}
      {hasAccount && <SyncStatus />}
      {/* D-0009: signed out, the sign-in screen stands in place of every screen, at whatever
          address was opened. A sign-in that ended never does this. */}
      <main className="mx-auto max-w-2xl p-4">{signedOut ? <SignInScreen /> : <Outlet />}</main>
    </>
  )
}
