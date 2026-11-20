---
id: G-0013
title: "harness waiting lists everything that waits on a human, across projects"
description: "One command lists what waits on the Engineer or the Requester: open questions, tasks' Remaining: lines and open GitHub issues assigned to them; it takes several project folders, so it shows all projects at once."
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

What waits on a human is spread over the registry, the task files and GitHub, and over
several projects. A human who has to look in each place will miss things, and the work they
block stays blocked.

# Decision

- `harness waiting` lists everything that waits on the Engineer or the Requester: open
  questions, tasks' `Remaining:` lines, and open GitHub issues assigned to them.
- It takes several project folders (`harness waiting <dir>...`), so it can show all
  projects at once.
- It reads issues through `gh` and still lists the rest when `gh` is missing.

# Rationale

One list is the only version a human will actually read. Building it from the records, with
no store of its own, means it can't disagree with them.

# Consequences

- Questions, `Remaining:` lines and assigned issues must be kept in their agreed form, or
  they don't show up.

# Guidance for agents

- When something waits on a human, put it where `harness waiting` finds it: a question, a
  `Remaining:` line, or an assigned issue.
- Offer the list at the start of a session with the Engineer.
