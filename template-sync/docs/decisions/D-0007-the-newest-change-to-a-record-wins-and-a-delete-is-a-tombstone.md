---
id: D-0007
title: "The newest change to a record wins, and a delete is a tombstone"
description: "Two devices' changes are merged per record: the one with the newest updatedAt wins, decided by the backend, which ignores a change older than what it has; a delete sets a tombstone and syncs like any other change."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: architect       # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [data, sync]
---

# Context

Each device changes its own copy, with or without a connection (D-0002). When two devices
changed the same record, something has to decide what both end up with. The template
started with the simplest rule that never loses a whole record; the project can replace it.

# Decision

- **Per record, the newest `updatedAt` wins.** The whole record is taken, not field by
  field.
- **The backend decides it** (`backend/pb_hooks/newest_wins.pb.js`): a change that is older
  than what it has is not saved, and the answer is the stored record, which the device
  takes over. So two devices can't overwrite each other by arriving in the wrong order.
- **A delete is a tombstone:** `deletedAt` is set, with a new `updatedAt`, and it syncs
  like any other change. Nothing is ever removed, on the device or on the backend.
- **A device takes in a fetched record only when it is newer than its own,** and never one
  it has a change waiting for: sending that change settles it.

# Rationale

One rule, decided in one place, gives every device the same result whatever order they
sync in. Tombstones let a delete travel like a change, and keep a deleted record's slug
from being given away (D-0005).

# Consequences

- Of two changes to the same record, the older one is lost as a whole, even when they
  touched different fields. For records that people edit at the same time, that needs a
  finer rule and a new decision.
- "Newest" is by each device's own clock. A device whose clock is wrong can win or lose
  when it shouldn't.
- Records only ever accumulate. Removing them for good is a later decision, and would be
  irreversible (G-0009).
- The app shows what waits ("3 changes not synced"), not what lost.

# Guidance for agents

- Every write stamps a new `updatedAt`; never write a record without one, and never set it
  by hand.
- Filter out tombstones in every read (`deletedAt !== null`).
- Don't remove a record to "clean up": a missing record can't sync as a delete.
- Changing how changes are merged is a new decision that replaces this one, with the hook,
  the engine and `backend/smoke-test.sh` changed together.
