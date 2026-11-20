---
id: D-0002
title: "The app is local-first and ready to sync"
description: "Each device keeps the full copy in IndexedDB; every record has updatedAt and a tombstone, and every change goes through one write API that also queues it in an outbox; sync itself comes with the backend."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [data]
---

# Context

Offline-first with sync is the default suggestion for a new project (G-0020), on the stack
of G-0017. The project starts without a backend (T-0002 adds it), but data written before
sync exists must be able to sync later without being rewritten.

# Decision

- **The device keeps the full copy,** in IndexedDB through Dexie (`src/db/db.ts`). The app
  works with no connection.
- **Every record carries `updatedAt`** (the time of its last change) **and `deletedAt`** (a
  tombstone, `null` while alive). A delete sets the tombstone; nothing is removed.
- **Every change goes through one write API** (`src/db/write.ts`). It validates the input,
  stamps `updatedAt`, and writes the record and an **outbox** row in one transaction.
- **Reads are plain Dexie queries** that leave out records with a tombstone.
- **There is no sync yet.** `src/sync/README.md` says what the engine has to do, and
  `src/config.ts` says whether a build may sync: only production, and only with a backend
  address (G-0019).
- **Everything but production starts with seeded demo data** (`src/seed/demo.ts`).

# Rationale

With the times, tombstones and outbox in place from the first record, adding sync is a
matter of sending the outbox and merging what comes back; nothing already stored has to
change. One write API keeps that true as screens are added.

# Consequences

- A screen that writes to a table directly makes a change that will never sync.
- The schema changes only by adding a Dexie version with an upgrade that keeps the data.
- How two devices' changes are merged, and who may read and write, are still to be decided,
  with the backend (T-0002).

# Guidance for agents

- Add a table: give its records `id`, `createdAt`, `updatedAt` and `deletedAt`, add it to
  `SyncedTable`, and write to it only through functions in `src/db/write.ts`, with tests.
- Never remove a record or an outbox row outside the sync engine.
- When you add a screen or a field, add demo data that shows it (G-0019).
- Stop and ask the Engineer before anything outside production would reach a real backend.
