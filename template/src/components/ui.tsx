import type { ComponentProps, ReactNode } from 'react'
import type { ItemStatus } from '../db/db'
import { t } from '../text'

// D-0003: the building blocks every screen uses. Tokens only; all of them are on /design.

/** A heading underlined with an accent bar as wide as its text. */
export function AccentHeading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return (
    // A page's heading can take the focus when the screen changes; it is not in the tab order.
    <Tag tabIndex={level === 1 ? -1 : undefined} className={`m-0 inline-block max-w-full font-semibold ${level === 1 ? 'text-2xl' : 'text-lg'}`}>
      {children}
      <span aria-hidden="true" className="mt-1 block h-1 w-full rounded-full bg-accent" />
    </Tag>
  )
}

const BUTTON_LOOKS = {
  primary: 'bg-accent font-semibold text-on-accent',
  secondary: 'border border-line bg-bg text-text',
  danger: 'border border-text bg-bg font-semibold text-text',
} as const

/** The classes of a button, for links that look like one. */
export function buttonClass(variant: keyof typeof BUTTON_LOOKS = 'primary'): string {
  return `inline-block shrink-0 rounded-full px-5 py-2 text-base no-underline disabled:opacity-60 ${BUTTON_LOOKS[variant]}`
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_LOOKS }) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />
}

const STATUS_CLASSES: Record<ItemStatus, string> = {
  open: 'bg-status-open-bg text-status-open-text',
  doing: 'bg-status-doing-bg text-status-doing-text',
  done: 'bg-status-done-bg text-status-done-text',
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-sm whitespace-nowrap ${STATUS_CLASSES[status]}`}>{t.statuses[status]}</span>
}

export const inputClass = 'block w-full rounded-card border border-line bg-bg px-4 py-2 text-base text-text'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 mb-0 text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-line bg-surface px-4 py-3">{children}</div>
}

export const bandClass = 'm-0 bg-surface px-4 py-1.5 text-sm'

/** The strip under the header that says what this build runs on. */
export function Band({ children }: { children: ReactNode }) {
  return (
    <p className={bandClass} role="status">
      {children}
    </p>
  )
}

export const linkClass = 'text-text underline decoration-accent decoration-2 underline-offset-4'
