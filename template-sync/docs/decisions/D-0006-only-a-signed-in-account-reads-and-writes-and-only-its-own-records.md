---
id: D-0006
title: "Only a signed-in account reads and writes, and only its own records; sign-up is closed"
description: "Every record on the backend has an owner, and only that account reads or changes it; nobody makes an account for themselves: the Engineer makes, changes and removes accounts in the backend's admin screen."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: architect       # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [access, backend]
---

# Context

The app syncs with a backend that is reachable from the internet (D-0002, G-0018). The
template had to start with an answer to who may read and write. It chose the closed one;
the project can replace it.

# Decision

- **Every record has an owner,** the account that made it. Only a signed-in account reads
  or changes a record, and only its own. A visitor and any other account get nothing: an
  empty list, and "not found" for a record. No record changes hands.
- **Nothing is removed through the backend's API.** A delete is a tombstone (D-0007).
- **Sign-up is closed.** Nobody makes an account for themselves, and an account can't change
  or remove itself. The Engineer makes, changes and removes accounts in the backend's admin
  screen, which the internet can't reach (D-0008).
- **Signing in is by e-mail and password.** A sign-in lasts 30 days, and syncing renews it.
  The backend's rate limits are on.
- **A device asks for its own account's records only,** whatever the backend's rules would
  also let it see.

These are the rules of the `users` and `items` collections in
`backend/pb_migrations/1700000000_initial.js`; `backend/smoke-test.sh` proves them on every
change to the backend.

# Rationale

Closed is the safe place to start: a project that wants to share records, or to let people
sign up, opens exactly what it needs with a decision of its own, instead of finding out
later what was open all along.

# Consequences

- The app shows a sign-in screen and no way to make an account or to reset a password: "No
  account yet? Ask whoever runs this app."
- A forgotten password, and a new user, are the Engineer's to handle.
- Sharing a record with another account, or showing one to visitors, needs a new decision,
  a migration that changes the rules, and a look at what `backend/funnel.json` opens.

# Guidance for agents

- Give every new collection the `owner` field and the same owner-only rules, and add its
  check to `backend/smoke-test.sh`: a visitor and another account read and write nothing.
- Never open a rule, sign-up or a new path in `backend/funnel.json` without a decision that
  replaces this one. Who may get in is the Engineer's to decide (G-0009).
- Never make an account, or change a password, on a real backend yourself.
