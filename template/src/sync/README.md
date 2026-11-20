# Sync

Not built yet. The app is local-first and ready to sync (D-0002): this folder is where the
sync engine goes once the project has a backend.

What is already in place:

- **Every record** carries `updatedAt` and `deletedAt` (a tombstone; nothing is removed), in
  `src/db/db.ts`.
- **Every change** goes through `src/db/write.ts`, which adds a row to the `outbox` table in
  the same transaction: the table, the record's id, `put` or `delete`, and when.
- **`src/config.ts`** says whether this build syncs. `syncConfig.enabled` is true only in a
  production build that was given `BACKEND_URL`; previews, local development and tests
  never get the address (G-0019).

What the engine has to do:

1. Start from `main.tsx` only when `syncConfig.enabled`, with `syncConfig.url`.
2. **Push:** send the outbox rows in order, and delete a row once the backend confirmed it.
3. **Pull:** fetch records changed since the last pull and write them to Dexie directly (not
   through the write API, which would queue them again). The newest `updatedAt` wins.
4. Let the backend settle slugs two devices picked offline (D-0005), and take its answer.
5. Add the backend's origin to `connect-src` in `netlify.toml`.

How conflicts are settled, and who may read and write, are decisions to record before
building it.
