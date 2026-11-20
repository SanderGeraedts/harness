---
id: G-0018
title: "The backend is PocketBase on the NAS behind Tailscale Funnel; the front end is on Netlify with deploy previews"
description: "A new project's backend is a PocketBase app on the NAS, reachable from the internet through its own Tailscale Funnel address; the front end is a Netlify site with a deploy preview for every pull request."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [stack]
---

# Context

A project with sync or sign-in needs a backend and a place to host the front end. Choosing
them per project multiplies the infrastructure the Engineer has to run and that spin-up
(G-0024) has to create.

# Decision

- **PocketBase is the backend,** one app per project, running on the NAS.
- It is reachable from the internet only through **Tailscale Funnel**, each project with its
  own address; the NAS itself is not exposed.
- **The front end is on Netlify,** with a deploy preview for every pull request.
- Each of these can be overruled per project (G-0002); a change of hosting or backend costs
  money or touches infrastructure, so it is the Engineer's (G-0009).

# Rationale

PocketBase is one small binary with a database, sign-in, files and an admin screen, which
fits a NAS and a project of this size. Funnel gives a public HTTPS address without opening
the home network. Netlify hosts a static app for free and its previews let a Requester see a
change before it merges.

# Consequences

- The backend is only as available as the NAS; projects should work without it (G-0020).
- Backups are the NAS's job (G-0023), and managing it is G-0022.
- A backend change is published by its own workflow after the merge (G-0011).

# Guidance for agents

- Don't add another hosted service or database to a project without a decision by the
  Engineer.
- Never expose the NAS in any way other than the project's Funnel address.
- Keep addresses, tokens and keys out of the repository.
