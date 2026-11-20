import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, Field, inputClass } from '../components/ui'
import { t } from '../text'
import type { SignInResult } from './auth'

// The sign-in form, used by the sign-in screen and by the account screen after a sign-in
// ended. There the e-mail is filled in and read-only (D-0010). Sign-up is closed (D-0006),
// so there is no link to make an account or to reset a password.

const ERRORS: Record<Exclude<SignInResult, 'ok'>, string> = {
  wrong: t.signInWrong,
  'no-connection': t.signInNoConnection,
  failed: t.signInFailed,
}

export function SignInForm({
  onSignIn,
  lockedEmail,
  initial = {},
}: {
  onSignIn: (email: string, password: string) => Promise<SignInResult>
  /** The account that owns this device's data: the only one that may sign in again. */
  lockedEmail?: string
  /** A state to start in, for /design. */
  initial?: { email?: string; password?: string; error?: string; busy?: boolean }
}) {
  const [email, setEmail] = useState(lockedEmail ?? initial.email ?? '')
  const [password, setPassword] = useState(initial.password ?? '')
  const [error, setError] = useState<string | null>(initial.error ?? null)
  const [busy, setBusy] = useState(initial.busy ?? false)
  const id = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (email.trim() === '' || password === '') {
      // Nothing is sent; the focus goes to the first empty field.
      setError(t.signInEmpty)
      ;(email.trim() === '' ? emailRef : passwordRef).current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const result = await onSignIn(email, password)
    if (result === 'ok') return // the screen changes; this form goes away
    setBusy(false)
    setError(ERRORS[result])
    if (result === 'wrong') {
      // Never say which of the two was wrong. The e-mail stays; the password is asked again.
      setPassword('')
      passwordRef.current?.focus()
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label={t.signIn} aria-describedby={error ? `${id}-error` : undefined}>
      <Field label={t.email} htmlFor={`${id}-email`}>
        <input
          ref={emailRef}
          id={`${id}-email`}
          className={`${inputClass} read-only:bg-surface read-only:text-muted`}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          readOnly={lockedEmail !== undefined}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t.password} htmlFor={`${id}-password`}>
        <input
          ref={passwordRef}
          id={`${id}-password`}
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && (
        <p id={`${id}-error`} role="alert" className="font-semibold">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? t.signingIn : t.signIn}
      </Button>
      {lockedEmail === undefined && <p className="mb-0 text-muted">{t.signInNoAccount}</p>}
    </form>
  )
}
