---
id: T-0002
title: "Run the backend, give production its address, and make the first account"
description: "Put the app on its host with deploy previews, run the published backend image with automatic snapshots, give the production build its address, make the first account, and check that two devices end up with the same data."
status: Open                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [D-0002, D-0006, D-0008, D-0009, G-0009, G-0018, G-0019, G-0023]
raised_on: __DATE__
done_on: ""
result: []                  # PR URLs
---

# Goal

The project was created with sync (D-0002): the app signs in and syncs, and the repository
builds and publishes the backend's image (D-0008). Nothing runs yet. Until it does, a
production build says "Only on this device" and works without sync, and every other task
continues on demo data.

This task makes it run: the app on its host, the backend on the NAS behind its own address
(G-0018), and production given that address.

Creating a site and a backend is infrastructure: only the Engineer starts it, in a session
of their own (G-0009). The team prepares; it never does this for a Requester.

# Done when

- The production address serves the app, and shows the sign-in screen.
- A deploy preview shows "Demo data · sync is off" and no sign-in screen, and no file it
  serves holds the backend's address (G-0019).
- From outside, the backend's health check answers; its admin screen and its superuser
  sign-in do not (D-0008); the paths in `backend/funnel.json` are the only ones that do.
- The backend's data has automatic snapshots (G-0023).
- The Engineer has made the superuser and the first account (D-0006), signed in on two
  devices, changed an item on each while offline, and confirmed both end up with the same
  data.
- No token, key, address or host name is written to the repository.

# Notes

- The image is published by the `backend` workflow on `main` as
  `ghcr.io/<owner>/<repository>-backend:stable`. A private repository's image is private:
  how the NAS may pull it is the Engineer's to decide.
- The production build needs `BACKEND_URL`, set on the host for the production context only.
  `vite.config.ts` ignores it in every other context as well, and `src/headers.ts` adds its
  origin to the content security policy of that build only.
- The backend is started with the app's origin as the one origin CORS answers, and with the
  command line `backend/throwaway.sh` uses, except for the address it listens on.
- `backend/README.md` says what lives where.

# Design

Nothing new to see: the sign-in screen, the account screen and the sync status are built.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
