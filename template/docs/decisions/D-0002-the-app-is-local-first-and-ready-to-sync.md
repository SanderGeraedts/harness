---
id: D-0002
title: "The app is local-first and ready to sync"
description: "The data lives on the device only: the Engineer chose no sync when the project was created. Every record still has updatedAt and a tombstone, and every change goes through one write API that also queues it in an outbox, so sync can be added later."
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
of G-0017. `harness create` asked "Sync between devices?", and the Engineer answered no
(`--no-sync`): this project has no backend, no sign-in and no sync. Data written now must
still be able to sync later without being rewritten, should that answer change.

# Decision

- **The data lives on the device only.** Nothing leaves it, and nobody signs in.
- **The device keeps the full copy,** in IndexedDB through Dexie (`src/db/db.ts`). The app
  works with no connection.
- **Every record carries `updatedAt`** (the time of its last change) **and `deletedAt`** (a
  tombstone, `null` while alive). A delete sets the tombstone; nothing is removed.
- **Every change goes through one write API** (`src/db/write.ts`). It validates the input,
  stamps `updatedAt`, and writes the record and an **outbox** row in one transaction.
- **Reads are plain Dexie queries** that leave out records with a tombstone.
- **Everything but production starts with seeded demo data** (`src/seed/demo.ts`).

# Rationale

A project that one person uses on one device needs no backend, and a backend is something
to run, secure and back up. With the times, tombstones and outbox in place from the first
record, adding sync later is a matter of sending the outbox and merging what comes back;
nothing already stored has to change. One write API keeps that true as screens are added.

# Consequences

- What is on a device exists only there: clearing the browser's data, or losing the device,
  loses it. The app says so in production: "Only on this device".
- A screen that writes to a table directly makes a change that could never sync.
- The schema changes only by adding a Dexie version with an upgrade that keeps the data.
- Adding sync later is a new decision that replaces this one, and a task for the architect:
  `src/sync/README.md` says what it takes. A backend is infrastructure, so it starts with
  the Engineer.

# Guidance for agents

- Add a table: give its records `id`, `createdAt`, `updatedAt` and `deletedAt`, add it to
  `SyncedTable`, and write to it only through functions in `src/db/write.ts`, with tests.
- Never remove a record or an outbox row.
- When you add a screen or a field, add demo data that shows it (G-0019).
- Don't add a backend, a sign-in or a network call for data without a decision that
  replaces this one.
