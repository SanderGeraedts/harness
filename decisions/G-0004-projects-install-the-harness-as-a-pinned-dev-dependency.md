---
id: G-0004
title: "Projects install the harness as a pnpm dev dependency from GitHub, pinned by tag"
description: "A project adds the harness with pnpm add -D github:SanderGeraedts/harness#vX.Y.Z; rules and global decisions are read from node_modules, scripts run through the harness bin, and CI and auto-merge call its reusable workflows at the same tag."
status: Accepted            # Accepted | Replaced
date: 2026-11-20
decided_by: engineer
since: 0.1.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: []
replaced_by: []
tags: [process]
---

# Context

The way of working has to reach every project in one piece: rules, global decisions, the
agent team, scripts and workflows. Copying files into each project lets them drift; a
registry package would need publishing and credentials.

# Decision

- A project installs the harness as a dev dependency from GitHub, pinned by tag:
  `pnpm add -D github:SanderGeraedts/harness#vX.Y.Z`. The lockfile holds the exact commit.
- **Rules and global decisions are read from `node_modules/@sandergeraedts/harness/`**; they
  are not copied into the project.
- **Scripts run through the `harness` bin** (`pnpm exec harness <command>`).
- **CI and auto-merge call the harness's reusable workflows** (`workflow_call`), pinned by
  the same tag as the dependency.
- The few files a tool needs inside the project (the agent definitions, the git hook, the
  permission rules, the registry README and templates) are written by `harness sync`, and
  `harness check` fails when they are stale.
- The harness supports projects that use Node. Others are out of scope.

# Rationale

A tagged git dependency needs no package registry, is reproducible through the lockfile, and
updates in one reviewable pull request. Reading from `node_modules` means there is one copy
of every rule per version.

# Consequences

- A fresh clone must run `pnpm install` before agents can read the rules.
- The harness must not need a build or an install script: it is used as checked in.
- The workflow tag and the dependency tag are two places to bump; the update pull request
  changes both.

# Guidance for agents

- Never copy rules or global decisions into a project; link to them in `node_modules`.
- Never edit a file that `harness sync` writes; change the harness and update.
- Keep the workflows' tag equal to the installed version.
