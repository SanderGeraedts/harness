---
id: D-0009
title: "Only the user's own sign-out clears the device or shows the sign-in screen in place of the app"
description: "A sign-in that ends by itself, because its date passed or the backend refuses it, only pauses sync: everything on the device stays and can be changed; only an explicit sign-out clears the device, after syncing and after asking when changes would be lost."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: architect       # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [access, sync, design]
---

# Context

The device keeps the full copy, and changes that haven't synced exist only there (D-0002).
A sign-in doesn't last for ever (D-0006): its date passes, or the Engineer changes the
password. That can happen while the device is offline, with changes waiting.

# Decision

In a production build that syncs, the sign-in has three states:

- **Signed out:** nobody signed in on this device, or somebody signed out. The device holds
  no data, and every address shows the sign-in screen.
- **Signed in:** the app, with "Account" in the header and the sync status under it.
- **Sign-in ended:** the backend no longer accepts the sign-in, or its date passed, online
  or offline. **The app stays exactly as it was:** everything on the device can be read and
  changed. Only syncing stops, and the sync status asks to sign in again.

So:

- **Only the user's own "Sign out" ever clears the device, or shows the sign-in screen in
  place of the app.** A sign-in that ends by itself never does either.
- **Signing out syncs first.** With everything synced it clears the device: every table,
  what sync remembers, the account and the token. With changes that couldn't sync it clears
  nothing and asks first, naming their number; "Cancel" leaves everything as it was.
- The account that signed in stays the owner of what is on the device until it signs out
  (D-0010).

# Rationale

A user who is offline with a day of changes must not lose them, or lose sight of them,
because a date passed. Clearing is the one thing here that can't be undone, so it happens
only when the user asked for it, and says what it costs when it costs something.

# Consequences

- A device whose sign-in ended keeps working, and keeps its data, for as long as nobody
  signs in again or signs out. What is on it is as private as the device.
- The sync engine must tell "the sign-in ended" from "the backend can't be reached": the
  first pauses sync, the second is tried again.
- Signing out on a shared device is the user's own responsibility; the app says what
  signing out does.

# Guidance for agents

- Never clear a table, the outbox or the account anywhere but in the sign-out
  (`src/auth/auth.ts`). Not on a refused request, not on an error, not on a new version.
- Never put the sign-in screen in place of a screen for a sign-in that ended; `Layout.tsx`
  does that for `signed-out` only.
- A new table is cleared by the sign-out with the rest: it clears every table the database
  has.
- Keep the tests that hold this: `src/auth/auth.test.ts`, `src/sync/engine.test.ts` and
  `e2e/production/account.spec.ts`.
