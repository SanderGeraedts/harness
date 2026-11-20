import { useNavigate } from '@tanstack/react-router'
import { SignInForm } from '../auth/SignInForm'
import { SignOut } from '../auth/SignOut'
import { AccentHeading, Card } from '../components/ui'
import { syncApp, useAuthState } from '../sync/app'
import { t } from '../text'
import { NotFound } from './NotFound'

// /account: who is signed in and how to sign out, or, after a sign-in ended, how to sign in
// again (D-0009, D-0010). The route exists only in a build that syncs (router.tsx).

export function AccountPage() {
  const authState = useAuthState()
  const navigate = useNavigate()
  const app = syncApp()
  const account = app?.auth.account()
  if (!app || !account) return <NotFound />

  // Signed out, the sign-in screen stands in place of this one (Layout.tsx); it shows at `/`.
  const signOut = async (options: { force: boolean }) => {
    const result = await app.auth.signOut(options)
    if (result.done) await navigate({ to: '/', replace: true })
    return result
  }

  return (
    <section>
      <div className="mb-5">
        <AccentHeading>{t.account}</AccentHeading>
      </div>
      {authState === 'ended' ? (
        <>
          <div className="mb-5" role="status">
            <Card>{t.signInEnded}</Card>
          </div>
          {/* Only the account that owns what is on this device signs in again (D-0010). */}
          <SignInForm onSignIn={app.auth.signIn} lockedEmail={account.email} />
          <div className="mt-8">
            <SignOut onSignOut={signOut} hint={t.otherAccount} variant="secondary" />
          </div>
        </>
      ) : (
        <>
          <p className="mb-4">{t.signedInAs(account.email)}</p>
          <SignOut onSignOut={signOut} hint={t.signOutHint} variant="danger" />
        </>
      )}
    </section>
  )
}
