# Sync

Not part of this project: when it was created the Engineer chose no sync (D-0002). The app
is local-first and ready for it, and this folder is where a sync engine would go.

What is already in place:

- **Every record** carries `updatedAt` and `deletedAt` (a tombstone; nothing is removed), in
  `src/db/db.ts`.
- **Every change** goes through `src/db/write.ts`, which adds a row to the `outbox` table in
  the same transaction: the table, the record's id, `put` or `delete`, and when.
- **`src/config.ts`** says whether a build may sync. `syncConfig.enabled` is true only in a
  production build that was given `BACKEND_URL`; previews, local development and tests
  never get the address (G-0019).
- **`src/headers.ts`** adds the backend's origin to the content security policy of such a
  build, and of no other.

What adding sync takes, after a decision that replaces D-0002:

1. A backend, with its schema, its access rules and a publish workflow, and a sign-in.
2. An engine, started from `main.tsx` only when `syncConfig.enabled`, that sends the outbox
   rows in order and deletes a row once the backend confirmed it, then fetches what changed
   since the last time and writes it to Dexie directly (not through the write API, which
   would queue it again).
3. Decisions on how two devices' changes are merged, who may read and write, and how slugs
   two devices picked offline are settled (D-0005).

The harness's template has all of this for a project created with `harness create --sync`.
Take it from there instead of writing it again.
