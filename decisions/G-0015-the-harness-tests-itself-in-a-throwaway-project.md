---
id: G-0015
title: "The harness tests itself by installing into a throwaway project"
description: "The harness's CI creates a throwaway project, installs the harness into it from the checkout, and runs the harness's own checks there."
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

Every project depends on the harness, and most of its pull requests merge themselves
(G-0006). A harness that passes its unit tests but can't be installed, or whose generated
files fail its own check, would break every project on their next update.

# Decision

- The harness's CI creates a throwaway project, installs the harness into it from the
  checkout (packed, as a project would receive it), and runs the harness's checks there:
  `init`, `sync`, `check`, the task index, an overrule, and the role.
- The harness also holds itself to its own way of working: tasks with checks, pull
  requests, a generated task index.

# Rationale

Installing the packed package is the only test that covers what a project actually gets:
the files list, the bin, and paths resolved from `node_modules`.

# Consequences

- A new command or generated file gets a step in the self-test.
- The self-test needs pnpm and git, and runs anywhere the harness is developed.

# Guidance for agents

- When you add or change a command, extend the self-test in the same pull request.
- Never merge a harness change with the self-test red or skipped.
