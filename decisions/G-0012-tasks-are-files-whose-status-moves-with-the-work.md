---
id: G-0012
title: "Tasks are files with a check; their status moves in the same pull request as the work, and the index is generated"
description: "One T-NNNN file per task with a Done-when check; status, Log and result change in the pull request that does the work, checks a human does afterwards go on a Remaining: line, a confirmation is recorded right away, and harness tasks-index generates the index that CI checks."
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

Agents need work described well enough to start from a file alone, and humans need a task
list that shows reality. A list kept by hand drifts from the work within days.

# Decision

- **One file per task** (`docs/tasks/T-NNNN-<slug>.md`), with a *Done when* check that
  proves it: a command and its expected output, a test, or what a named role confirms.
- **A task's status, Log and result move in the same pull request as the work,** for every
  task that pull request carries.
- **Checks a human must do afterwards go on a `Remaining:` line:** the task stays *Doing*
  and its last Log line starts the open items with `Remaining:`.
- **A human's confirmation is recorded right away,** in the session where it is given.
- **The task index is generated** by `harness tasks-index` and checked in CI
  (`harness check`): it fails when the index is out of step, a Done task has no `done_on`,
  a task that isn't Done has one, or a Doing or Done task has an empty Log.

# Rationale

Updating the task where the work happens costs a line and keeps the record next to the code
that proves it. A generated, checked index can't drift.

# Consequences

- A pull request that changes a task without regenerating the index fails CI.
- The *Doing* list, with its `Remaining:` lines, is where a human sees what waits on them.

# Guidance for agents

- Change the task file in the same pull request as the work, then run
  `harness tasks-index` and commit the index. Never edit the index by hand.
- Done only after the check ran, with its actual output in the task file.
- At the start of a session, look at *Doing* and record confirmations that were given.
