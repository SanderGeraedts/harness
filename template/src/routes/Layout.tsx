import { Link, Outlet } from '@tanstack/react-router'
import { deployContext, syncConfig } from '../config'
import { t } from '../text'

export function Layout() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" className="inline-block max-w-full text-xl font-semibold text-text no-underline">
          {t.appTitle}
          <span aria-hidden="true" className="mt-0.5 block h-1 w-full rounded-full bg-accent" />
        </Link>
      </header>
      {/* G-0019: everything but production runs on demo data, and says so. */}
      {deployContext !== 'production' && (
        <p className="m-0 bg-surface px-4 py-1.5 text-sm" role="status">
          {t.demoBanner}
        </p>
      )}
      {deployContext === 'production' && !syncConfig.enabled && (
        <p className="m-0 bg-surface px-4 py-1.5 text-sm" role="status">
          {t.offlineOnly}
        </p>
      )}
      <main className="mx-auto max-w-2xl p-4">
        <Outlet />
      </main>
    </>
  )
}
