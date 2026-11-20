---
id: G-0016
title: "pnpm is the package manager, pinned in package.json"
description: "Dependencies are installed with pnpm at the version in package.json's packageManager field, with pnpm-lock.yaml as the only lockfile; npm installs are refused."
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

Agents work in several worktrees of a project at once, and each needs its dependencies.
Mixed package managers produce competing lockfiles and installs that differ between
machines and CI.

# Decision

- Dependencies are installed with **pnpm**, at the version in `package.json`'s
  `packageManager` field.
- `pnpm-lock.yaml` is the only lockfile; a `package-lock.json` is never committed.
- A `preinstall` script refuses installs by another package manager. CI installs with
  `pnpm install --frozen-lockfile`.

# Rationale

pnpm's content-addressed store lets parallel worktrees share one copy of every package
instead of each copying `node_modules`, and the pinned version makes installs the same
everywhere. The harness itself is delivered through pnpm (G-0004).

# Consequences

- Every command in docs, scripts and workflows is a pnpm command.
- `harness init` adds the `preinstall` guard when the project has none.

# Guidance for agents

- Use `pnpm install`, `pnpm run <script>` and `pnpm exec`; never `npm` or `npx`.
- Change the pnpm version only by changing `packageManager`, in its own pull request.
