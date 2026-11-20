---
id: T-0002
title: "Give the project hosting, a backend and sync"
description: "Put the app on its host with deploy previews, create its backend, and build the sync engine that sends the outbox and merges what comes back."
status: Open                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [D-0002, D-0005, G-0018, G-0019, G-0020, G-0022, G-0023, G-0024]
raised_on: __DATE__
done_on: ""
result: []                  # PR URLs
---

# Goal

The app works on one device and is ready to sync (D-0002), but it has no host and no
backend. This task gives it both (G-0018), and builds the sync engine in `src/sync/`.

Creating the hosting site and the backend is infrastructure: only the Engineer starts it
(G-0024), in a session of their own. Until then every other task continues on demo data.

# Done when

- The production address serves the app, and two devices that changed data offline end up
  with the same data.
- A deploy preview runs on seeded data and cannot reach the backend (G-0019).
- The backend's data has automatic snapshots (G-0023).
- No token, key or address is written to the repository.

# Notes

- Decide and record first: how two devices' changes are merged, who may read and write,
  and how the backend settles slugs two devices picked offline (D-0005).
- `src/sync/README.md` lists what is in place and what the engine has to do.
- `netlify.toml` already holds the build settings and a strict content security policy;
  the backend's origin has to be added to `connect-src`.

# Design

To be written by the UX designer: how the app shows what has and hasn't synced.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
