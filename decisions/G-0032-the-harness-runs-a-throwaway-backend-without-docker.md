---
id: G-0032
title: "The harness runs a throwaway backend without Docker, from a pinned toolchain in a cache"
description: "harness backend fetches the PocketBase or Go version a project's backend pins into a per-user cache and builds and runs the throwaway backend from it, so agents need no Docker; the harness never installs Docker or anything else system-wide."
status: Accepted            # Accepted | Replaced
date: 2026-11-23
decided_by: engineer
since: 0.9.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [tooling, backend]
---

# Context

A project's backend tests, smoke test and production end-to-end tests need a running
backend. `backend/throwaway.sh` starts one with Docker. On a machine without Docker every
agent downloaded PocketBase, a Go toolchain and jq into a scratch folder itself and started
the backend by hand, each in its own way. Installing Docker Desktop instead needs admin
rights and system changes, and is paid for use at larger companies (G-0009: that is a human's
call).

# Decision

- A command, `harness backend`, reads the versions the project's backend pins (the
  PocketBase image tag, and the Go version when `backend/main.go` exists), downloads those
  exact releases once into a per-user cache, checks their published checksums, builds the
  backend when it is a Go program, and starts a throwaway backend with the same flags
  `throwaway.sh` uses. It prints the address, and stops it with `harness backend stop`.
- It also provides `jq` for the smoke test the same way.
- Nothing is installed system-wide and nothing needs admin rights. Docker stays optional: when
  it is there, `throwaway.sh` works as before.
- **The harness never installs Docker** or any other system-wide software.

# Rationale

One tested way replaces each agent's own, the downloads happen once instead of per agent,
and nothing on the machine changes.

# Consequences

- The command, its unit tests and a self-test step come in the pull request that builds it
  (G-0015).
- Agent definitions point to `harness backend` for local backend runs.

# Guidance for agents

- Use `harness backend` for local backend runs; never install software system-wide.
- Never run a downloaded program from inside the repository.
