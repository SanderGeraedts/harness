---
id: T-0004
title: "Spin up hosting and the backend, with automatic snapshots"
description: "Spin-up also creates the Netlify site with its subdomain and a PocketBase app on the NAS with its own Funnel address and a periodic snapshot task, using tokens that exist only in the Engineer's environment."
status: Open                # Open | Doing | Done | Dropped
depends_on: [T-0003]        # tasks that must be Done first
decisions: [G-0007, G-0009, G-0018, G-0019, G-0022, G-0023, G-0024]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
---

# Goal

Phase 4, the second half of spin-up (G-0024). After T-0003 has created the repository and
the app, the same prompt also creates where it runs:

- the Netlify site with its subdomain and deploy previews, using a Netlify token from the
  Engineer's environment;
- a PocketBase app on the NAS, on its own dataset, through `harness nas` (G-0022);
- its own Tailscale Funnel address, using a Tailscale OAuth client from the Engineer's
  environment;
- a periodic ZFS snapshot task on the project's dataset (G-0023);
- the production build wired to the backend's address, and nothing else (G-0019);
- the backend publish workflow, started by auto-merge after a backend change (G-0011).

# Done when

- Spin-up of a throwaway project gives a production address that serves the app and syncs
  with its backend, and a deploy preview that runs on seeded data without reaching it.
- `harness nas` shows the project's snapshot task, and a snapshot it has taken.
- No token, key, host or address is written to the repository or printed.
- The command refuses to run when `harness role` is not `engineer`.
- The Engineer confirms the throwaway project and its infrastructure were removed again.

# Notes

- This creates infrastructure and may cost money: it runs only in a session with the
  Engineer (G-0009), and each destructive NAS call still asks (G-0022).
- Removing a spun-up project is destructive and needs its own design; raise it as a question
  before building it.
- A project created before this exists needs its snapshot task added by hand (G-0023).

# Design

Nothing visible beyond what T-0003 designs.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
