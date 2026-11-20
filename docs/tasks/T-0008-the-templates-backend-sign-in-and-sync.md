---
id: T-0008
title: "Give the template a backend, sign-in and sync, chosen with create --sync"
description: "harness create --sync (the default) adds a PocketBase backend folder with its publish workflow, a sign-in screen and the sync engine to the new project; --no-sync leaves the app local-only; the backend image and sync are tested in the harness's CI against a throwaway backend."
status: Open                # Open | Doing | Done | Dropped
depends_on: [T-0003]        # tasks that must be Done first
decisions: [G-0011, G-0015, G-0017, G-0018, G-0019, G-0020, G-0021, G-0026]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
---

# Goal

Slice 2 of T-0004, whose *Notes* hold the architecture; read them first.

Offline-first with sync is the default suggestion for a new project (G-0020). After this
task `harness create` offers the choice, and a project that takes it is complete: its app
signs in and syncs, and its repository builds the backend image that spin-up (T-0004) will
run.

- **`create --sync | --no-sync`.** Asked in a terminal ("Sync between devices? [yes]"),
  default yes. The answer is recorded in the new project's decisions.
- **With sync,** the project also gets:
  - `backend/`: a PocketBase image with the schema and hooks baked in, a smoke test, and
    `funnel.json`, the paths the internet may reach;
  - a `backend` workflow that tests the image on an empty database and publishes it from
    `main`, and the auto-merge caller that starts it after a backend change (G-0011);
  - a sign-in screen and a session, in `src/auth/`;
  - the sync engine, in `src/sync/`, started only in a production build that was given a
    backend address (G-0019).
- **Without sync,** the project is what `create` makes today, without the task that says to
  add a backend.

# Done when

1. `pnpm test`, `pnpm run self-test` and `pnpm run check` pass. The self-test creates two
   projects with `--no-github`, one with `--sync` and one with `--no-sync`, and in each:
   install, type-check, unit tests, build and `harness check` pass. The `--no-sync` project
   has no `backend/`, `src/auth/` or `backend.yml`, and no `pocketbase` dependency.
2. **The backend, in the harness's CI.** A new job builds the `--sync` project's image,
   starts it on an empty database, and runs:
   - the smoke test: every collection exists; sign-up is closed; a signed-out visitor and
     another account read and write nothing of an owner's; an older change doesn't
     overwrite a newer one; two items given the same slug end up with different ones; CORS
     answers the app's origin only;
   - the app's backend tests: two clients of one account, each with changes made offline,
     end up with the same items after syncing, tombstones included.
3. **The end-to-end tests** of the `--sync` project pass (`node scripts/self-test.mjs
   --e2e`): on seeded data the app shows no sign-in screen and the band "Demo data · sync
   is off"; a production build with a backend address shows the sign-in screen, and after
   signing in against the throwaway backend an item made on one page appears on another.
4. **Only production.** A build with `CONTEXT=deploy-preview` and `BACKEND_URL` set holds
   neither the address nor the sign-in screen, and its `_headers` allows `connect-src
   'self'` only. A build with `CONTEXT=production` and the address holds it, and its
   `_headers` adds that origin to `connect-src` and nothing else.
5. **Nothing identifying.** The created project holds no address, tailnet name or dataset
   path; `backend/` and its README say where such values live instead (G-0026).
6. The UX designer has reviewed the built screens at 320px, in light and dark.
7. `v0.5.0` is tagged on a green `main`.

# Notes

## How the template is put together

- `template/` stays the app without sync. A new folder, `template-sync/`, holds what sync
  adds and the files it replaces; `create` copies it over the base when the project syncs.
  Add it to `files` in `package.json`.
- Files that differ between the two (the entry point, `src/sync/README.md`, the project's
  D-0002, its first tasks, the auto-merge caller, `package.json`'s dependencies) exist in
  both; nothing is patched line by line.
- The content security policy moves, for both, from `netlify.toml` to a `_headers` file
  written into `dist/` at build time, so a production build can add the backend's origin
  without the address being in the repository.

## What the template decides, recorded as the new project's decisions

A project can replace any of these later; they are the starting point, and each becomes a
`D-NNNN` record in `template-sync/docs/decisions/`.

- **Who may read and write:** only a signed-in account, and only its own records. Every
  record has an owner. Sign-up is closed; the Engineer makes accounts in the admin screen.
- **How two devices' changes are merged:** per record, the newest `updatedAt` wins. A
  delete is a tombstone and syncs like any change. The backend ignores a change that is
  older than what it has.
- **Slugs** two devices picked offline are settled by the backend: the second gets a
  number, and the device takes the backend's answer (the project's D-0005).
- **The backend:** PocketBase, schema changes only as migrations, proven on an empty
  database before they reach production (G-0019); the admin screen and the superusers are
  never among the Funnel paths.

## The backend folder

- `Dockerfile`: a pinned PocketBase image, with `pb_migrations/` and `pb_hooks/` copied in,
  and the label that links the image to the repository.
- Migrations: the users collection with sign-up closed, the example `items` collection with
  the fields the app's records have, owner-only rules, and rate limits on.
- Hooks: the newest-wins guard and the slug rule.
- `funnel.json`: the health check, the users collection and the items collection. T-0004
  reads it and refuses anything outside `/api/`.
- `smoke-test.sh`, run by the workflow against a container on an empty database.
- The workflow is a caller of a reusable `backend.yml` in the harness: build, start on an
  empty database, smoke test, the app's backend tests, and on `main` publish
  `ghcr.io/<owner>/<name>-backend` as `:stable` and `:sha-<commit>`.

## The app

- The engine does what `template/src/sync/README.md` lists: send the outbox in order, pull
  what changed since the last pull straight into Dexie, newest wins, take the backend's
  slug.
- It never starts outside a production build with an address: no sign-in screen, no
  network call, the band as now.
- Tests: the engine against a fake backend in the unit tests, and against the real image in
  the backend workflow. Never against a real backend (G-0019).

## What a user sees: for the UX designer, before it is built

- The sign-in screen: e-mail and password, a wrong password, no connection.
- Signed in: who is signed in and how to sign out; what happens to the data on the device
  after signing out.
- How the app shows what has and hasn't synced, and that it is working offline.
- A session that ended: the app keeps working on the device, and asks to sign in again.
- All words in `src/text.ts`; every new component on `/design`.

# Design

To be written by the UX designer, from *What a user sees* above.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 architect: raised as slice 2 of T-0004. Decided what the template starts
  with: owner-only access with sign-up closed, newest change wins per record, slugs settled
  by the backend. Handed to the UX designer for the sign-in and sync screens; nothing waits
  on a question.
