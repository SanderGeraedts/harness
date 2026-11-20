# The backend

What this project's backend *is*: PocketBase with the project's schema and hooks baked into
an image (D-0008). The app syncs with it (D-0002), and only the production build ever
reaches it (G-0019).

Where it *runs* is not in this repository, and never will be. See *What lives where*.

| File | What |
| --- | --- |
| `Dockerfile` | a pinned PocketBase image with the migrations and hooks copied in |
| `pb_migrations/` | the schema: accounts with sign-up closed (D-0006), and the collections the app syncs. The only way the schema changes |
| `pb_hooks/newest_wins.pb.js` | an older change never overwrites a newer one (D-0007) |
| `pb_hooks/slugs.pb.js`, `slug.js` | two records never share a slug (D-0005) |
| `funnel.json` | the paths the internet may reach, as a list of prefixes. Everything else stays private, the admin screen first of all |
| `throwaway.sh` | builds the image and starts it on an empty database, for tests |
| `smoke-test.sh` | proves the rules above against a throwaway backend |

## Change it

1. Add a migration to `pb_migrations/`: a new file, named with a later number. Never edit
   one that has run anywhere.
2. Make the same change on the device: a new Dexie version in `src/db/db.ts`, and the
   mapping in `src/sync/records.ts`.
3. Add a line to `smoke-test.sh` that would fail without the change. A new collection gets
   the owner-only rules, and its path in `funnel.json`.
4. Open a pull request. The `backend` workflow builds the image, starts it on an empty
   database, and runs the smoke test and `pnpm run test:backend`. After the merge it
   publishes `ghcr.io/<owner>/<repository>-backend` as `:stable` and `:sha-<commit>`.

## Try it

With Docker:

```sh
bash backend/throwaway.sh          # http://127.0.0.1:8090, on an empty database
bash backend/smoke-test.sh
BACKEND_TEST_URL=http://127.0.0.1:8090 pnpm run test:backend
bash backend/throwaway.sh stop
```

`pnpm run test:e2e` starts and stops one by itself for the tests of the sign-in and sync.

A throwaway backend has one superuser, for tests only: `admin@throwaway.invalid` with the
password in `throwaway.sh`. Its admin screen is at `http://127.0.0.1:8090/_/`.

**Never point a test, the dev server or a preview at a real backend** (G-0019). The smoke
test and the tests make accounts and records; they refuse any address that isn't on this
machine.

## What lives where

Nothing that says where the backend runs is in this repository: no address, no host or
network name, no storage path, no key. Don't add one, not even as an example or in a
comment.

| What | Where it lives |
| --- | --- |
| the backend's address | given to the production build by the host, as `BACKEND_URL`, for the production context only. The build puts its origin in the content security policy (`src/headers.ts`) |
| the app's origin, which CORS answers | given to the backend where it is started (`--origins`) |
| the machine it runs on, its storage and its snapshots (G-0023) | with the Engineer's infrastructure, outside this repository |
| the tokens and keys that create and reach all of that | with the Engineer, outside this repository. No agent reads, prints or carries one |
| the superuser and the accounts | in the running backend's own database. The Engineer makes them in the admin screen, which only their own network reaches |

Starting, changing or removing a running backend is infrastructure: only the Engineer
starts it (G-0009), and T-0002 is the task for the first time.

## What the internet can reach

`funnel.json` is read when the backend is put online. It may only hold paths under `/api/`,
and never `/api/` as a whole, the admin screen (`/_/`) or the superusers
(`/api/collections/_superusers/`). Changing it is a pull request like any other change, and
then the Engineer's to apply.
