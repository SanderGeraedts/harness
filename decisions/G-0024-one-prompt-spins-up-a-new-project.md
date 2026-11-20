---
id: G-0024
title: "One prompt spins up a new project: repository, app, hosting and backend, by the Engineer only"
description: "To be built later: one prompt creates the repository, the app, the Netlify site with its subdomain, and a PocketBase app on the NAS with its own Funnel address, using a Netlify token and a Tailscale OAuth client in the Engineer's environment; only the Engineer can do it."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [operations]
---

# Context

Starting a project by hand means a repository, the app's scaffold, a hosting site, a
backend app, an address for each and the wiring between them: an afternoon of steps that are
the same every time and easy to get subtly wrong.

# Decision

Recorded now, built later:

- **One prompt creates** the repository, the app (from the stack in G-0017, with the harness
  installed), the Netlify site with its subdomain, and a PocketBase app on the NAS with its
  own Funnel address and its snapshot task (G-0023).
- It protects the new repository's default branch with `harness protect` (G-0025), once
  its CI has run.
- It uses a **Netlify token and a Tailscale OAuth client that exist only in the Engineer's
  environment**.
- **Only the Engineer can do it.** No infrastructure token is ever on a Requester's machine.

# Rationale

Everything a new project needs is already decided globally, so creating one can be
mechanical. It creates infrastructure and may cost money, which makes it the Engineer's by
G-0009; keeping the tokens in the Engineer's environment enforces that.

# Consequences

- Until it is built, a new project is set up by hand along the same decisions, and an
  existing repository adopts the harness with `harness init`.
- It is built in two steps: repository and app first, hosting and backend after.

# Guidance for agents

- Don't create infrastructure for a new project in a Requester's session; raise it for the
  Engineer (G-0010).
- When building spin-up, read every token from the environment and never write one to disk.
