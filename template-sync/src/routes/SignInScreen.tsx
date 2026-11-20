import { SignInForm } from '../auth/SignInForm'
import { AccentHeading, Card } from '../components/ui'
import { syncApp, useOnline } from '../sync/app'
import { t } from '../text'

// What a signed-out device shows in place of every screen (D-0009). It is also the empty
// state of the app before the first sign-in: no item can be made before an account owns it.
// The address stays as it was opened, so after signing in the user is where they wanted to be.

export function SignInScreen() {
  const online = useOnline()
  const app = syncApp()
  if (!app) return null
  return (
    <section>
      <div className="mb-5">
        <AccentHeading>{t.signIn}</AccentHeading>
        <p className="mt-3 text-muted">{t.signInIntro}</p>
      </div>
      {/* The form stays usable: a device can be wrong about being offline. */}
      {!online && (
        <div className="mb-5" role="status">
          <Card>{t.signInOffline}</Card>
        </div>
      )}
      <SignInForm onSignIn={app.auth.signIn} />
    </section>
  )
}
