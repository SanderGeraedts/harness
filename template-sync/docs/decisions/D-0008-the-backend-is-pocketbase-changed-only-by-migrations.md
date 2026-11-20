---
id: D-0008
title: "The backend is PocketBase, changed only by migrations, and nothing about where it runs is in the repository"
description: "The backend is a PocketBase image built from backend/, whose schema changes only by migrations that are proven on an empty database before they reach production; the admin screen is never reachable from the internet, and no address, host name or key is in the repository."
status: Accepted            # Accepted | Replaced
date: __DATE__
decided_by: architect       # engineer | requester | the agent role, e.g. architect
overrules: []               # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []
resolves: []                # questions this answers, e.g. [Q-001]
tags: [backend, infrastructure]
---

# Context

A project's backend is PocketBase on the NAS, reachable through its own Funnel address
(G-0018), and only production may reach it (G-0019). This repository holds what the
backend *is*; where it runs is infrastructure, which only the Engineer starts.

# Decision

- **The backend is an image built from `backend/`:** a pinned PocketBase, with this
  project's migrations (`pb_migrations/`) and hooks (`pb_hooks/`) baked in.
- **The schema changes only by a new migration.** A migration that has run anywhere is
  never edited. Nothing is changed by hand in the admin screen of a running backend.
- **Every change is proven on an empty database first.** The `backend` workflow builds the
  image, starts it on an empty database, runs `backend/smoke-test.sh` and the app's backend
  tests (`pnpm run test:backend`), and only then, on `main`, publishes the image as
  `:stable` and `:sha-<commit>`. A merge that touched `backend/` starts it (G-0011).
- **`backend/funnel.json` lists the paths the internet may reach:** the health check and
  the collections the app uses. The admin screen (`/_/`) and the superusers are never among
  them, and neither is `/api/` as a whole.
- **CORS answers the app's own origin only.**
- **Nothing that identifies where the backend runs is in the repository:** no address, no
  host or network name, no storage path, no key. The production build gets the address
  from its host (`BACKEND_URL`, for the production context only), and the content security
  policy takes it from there (`src/headers.ts`).

# Rationale

A backend that exists only as migrations in the repository can be rebuilt, reviewed and
tested like the rest of the code, and a change that would break it fails in CI instead of
in production. Keeping addresses out of the repository lets the repository be read by
anyone without telling them where to knock.

# Consequences

- The NAS snapshots the backend's data on a schedule (G-0023), so a migration needs no
  manual backup first. Rolling back is the Engineer's.
- A migration that removes or rewrites data can't be undone by the next migration: it
  needs the Engineer's yes first (G-0009).
- The first superuser and the first account are made by the Engineer on the running
  backend; no workflow does it (T-0002).
- PocketBase is before its 1.0: a new version is read about first, and treated like a
  schema change.

# Guidance for agents

- A schema change is: a new file in `backend/pb_migrations/`, the same change in
  `src/db/db.ts` (a new Dexie version) and `src/sync/records.ts`, and a line in
  `backend/smoke-test.sh` that would fail without it.
- In hooks, read the request through `e.requestInfo()`, not `e.request`, and keep
  everything inside the handler: each hook runs in its own JavaScript context.
- A new collection the app reaches gets its path in `backend/funnel.json`. Never add `/_/`,
  the superusers, or `/api/` itself.
- Never write an address, a host name, a network name, a storage path or a key in this
  repository, in a commit message or in a pull request. `backend/README.md` says where
  such values live.
- Never start, change or remove a running backend yourself: that is infrastructure, and
  the Engineer's.
