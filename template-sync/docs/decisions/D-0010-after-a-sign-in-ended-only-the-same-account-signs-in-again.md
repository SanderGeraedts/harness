---
id: D-0010
title: "After a sign-in ended, only the same account signs in again"
description: "After a sign-in ended the e-mail in the sign-in form is filled in and read-only, and a sign-in as any other account is refused: the data on the device belongs to the account that put it there; another account signs out first."
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

After a sign-in ended, the device still holds one account's records and its changes that
haven't synced (D-0009). The next sign-in decides whose records those become on the
backend: the sync engine sends what waits as the account that is signed in.

# Decision

- **The device remembers the account that signed in** (its id and its e-mail), until that
  account signs out.
- **After a sign-in ended, the sign-in form on `/account` has that e-mail filled in and
  read-only.** Only the password is asked.
- **A sign-in that turns out to be another account is refused,** with the same words as a
  wrong password, and nothing syncs.
- **To use another account, sign out first:** "Want to use another account? Sign out
  first." That clears the device, after asking when changes would be lost (D-0009).

# Rationale

Without this, signing in as someone else on a device with waiting changes would hand one
account's records to another: a leak that no later change takes back. Making the e-mail
read-only says, without an error, what the form is for.

# Consequences

- When the Engineer changes an account's e-mail on the backend while its sign-in has
  ended, the device still shows the old one. Signing in with it fails, and the user signs
  out first; changes that hadn't synced are then lost, after the question.
- Two people sharing one device each sign out before the other signs in.

# Guidance for agents

- Never let the e-mail of the sign-in form be edited while an account owns the device's
  data, and never drop the check in `signIn` (`src/auth/auth.ts`) that the account is the
  same one.
- The sync engine runs only while the signed-in account is the one that owns the device's
  data.
