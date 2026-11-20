# Sync

The app keeps the full copy on the device and syncs it with the project's backend (D-0002).
This folder is the device's side; `backend/` is the other.

**Sync exists only in a production build that was given the backend's address** (G-0019).
`main.tsx` loads `start.ts` in that build alone. In every other build nothing here runs:
no sign-in, no network call, and the band says "Demo data · sync is off".

| File | What |
| --- | --- |
| `engine.ts` | a sync run: push the outbox, pull what changed, renew the sign-in |
| `records.ts` | how a record on the device maps to its record on the backend |
| `state.ts` | what the device remembers about sync, in localStorage: the account, the token, how far the last pull got |
| `start.ts` | makes the backend's client, the sign-in and the engine. The only file that imports the client |
| `app.ts` | what the screens know: hooks for the sign-in, the engine's status, online, and protected storage |
| `line.ts` | the words of the sync status, by rule |
| `testing.ts` | a fake backend for the unit tests |
| `sync.backend.test.ts` | the same against the real image: `pnpm run test:backend` |

## A run

1. **Push.** The outbox rows go up in the order they were made. Rows for one record go as
   one push of its current state. A row is removed only after the backend confirmed it; a
   failure keeps every row.
2. **Pull.** What changed on the backend since the last pull, for this account only, is
   written to Dexie directly (not through `src/db/write.ts`, which would queue it again).
3. **Renew.** The run asks the backend for a new token, which also proves the sign-in is
   still good.

Runs start by themselves: when the app opens, comes back online or into view, after a
sign-in, and two seconds after a change. A failed run is tried again, after 5 seconds at
first and at most every 5 minutes. One run at a time, across tabs.

## The rules

- **The newest change to a record wins** (D-0007). The backend decides: it answers an older
  change with the record it has, and the device takes that over. A record with a change
  still in the outbox is never overwritten by a pull.
- **A delete is a tombstone** and syncs like any change. Nothing is removed.
- **The backend settles slugs** (D-0005): the device takes the slug in the backend's
  answer.
- **A sign-in that ended only pauses sync** (D-0009). The outbox stays, and everything on
  the device can still be changed. Only the user's own sign-out clears the device, and the
  engine stops writing the moment it does.
- **A backend that can't be reached** is not a sign-in that ended: the run fails and is
  tried again.

## Add a table

1. The table in `src/db/db.ts` (a new Dexie version), with `id`, `createdAt`, `updatedAt`
   and `deletedAt`, and its name in `SyncedTable`.
2. Its functions in `src/db/write.ts`, each queueing an outbox row in the same transaction.
3. Its name in `SYNCED_TABLES` and its cases in `toServer` and `fromServer`
   (`records.ts`). Tables are pulled in that order: one that others point to comes first.
4. The collection on the backend: see `backend/README.md`.

## What it doesn't do

- It doesn't merge two changes to one record field by field (D-0007).
- A change the backend refuses for good, such as a value its schema doesn't take, stays at
  the head of the outbox and holds up the changes behind it: the status says "Sync failed".
  Keep what `src/db/write.ts` accepts within what the backend's schema accepts.
- It doesn't push a change to other devices by itself: they fetch it on their next run.
