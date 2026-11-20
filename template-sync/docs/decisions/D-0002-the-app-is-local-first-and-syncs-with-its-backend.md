---
id: D-0002
title: "The app is local-first and syncs with its backend"
description: "Each device keeps the full copy in IndexedDB and syncs it with the project's backend: the Engineer chose sync when the project was created. Every change goes through one write API that queues it in an outbox, which the sync engine sends; only a production build reaches the backend."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [data, sync]
---

# Context

Offline-first with sync is the default suggestion for a new project (G-0020), on the stack
of G-0017 and G-0018. `harness create` asked "Sync between devices?", and the Engineer
answered yes (`--sync`, the default). The template brought the backend's image, the sign-in
and the sync engine with it; D-0006 to D-0010 record what it decided as a starting point.

# Decision

- **The device keeps the full copy,** in IndexedDB through Dexie (`src/db/db.ts`). The app
  works with no connection; sync catches up when there is one.
- **Every record carries `updatedAt`** (the time of its last change) **and `deletedAt`** (a
  tombstone, `null` while alive). A delete sets the tombstone; nothing is removed.
- **Every change goes through one write API** (`src/db/write.ts`). It validates the input,
  stamps `updatedAt`, and writes the record and an **outbox** row in one transaction.
- **The sync engine** (`src/sync/engine.ts`) sends the outbox in order, and fetches what
  changed on the backend since the last time, straight into Dexie. It removes an outbox
  row only once the backend confirmed it.
- **Only a production build that was given the backend's address syncs** (G-0019,
  `src/config.ts`). Previews, the dev server and tests never get the address: they run on
  seeded demo data (`src/seed/demo.ts`), show no sign-in and make no network call for data.
- **Reads are plain Dexie queries** that leave out records with a tombstone. No screen
  waits for the network.

# Rationale

A full copy on the device makes the app as fast and as available as the device itself, and
an outbox written in the same transaction as the change means no change can be made
without also being queued. Keeping every build but production away from the backend means a
mistake in a preview can never touch real data.

# Consequences

- A screen that writes to a table directly makes a change that will never sync.
- The schema changes in two places at once: a Dexie version with an upgrade that keeps the
  data, and a migration in `backend/pb_migrations/` (D-0008), with `src/sync/records.ts`
  mapping one to the other.
- The backend's image is built and published by this repository; where it runs, and its
  address, are infrastructure and are not in the repository (D-0008).
- Until the backend runs somewhere and production has its address, a production build says
  "Only on this device" and works without sync (T-0002).

# Guidance for agents

- Add a table: give its records `id`, `createdAt`, `updatedAt` and `deletedAt`, add it to
  `SyncedTable` (`src/db/db.ts`) and `SYNCED_TABLES` (`src/sync/records.ts`), write to it
  only through functions in `src/db/write.ts`, add the collection in a new migration with
  the owner-only rules (D-0006), and add its path to `backend/funnel.json`.
- Never remove a record or an outbox row outside the sync engine and the sign-out.
- When you add a screen or a field, add demo data that shows it (G-0019).
- Never give a preview, the dev server or a test the address of a real backend. Tests run
  against a throwaway one (`backend/throwaway.sh`). Stop and ask the Engineer before
  anything outside production would reach real data.
