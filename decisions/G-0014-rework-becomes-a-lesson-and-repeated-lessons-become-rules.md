---
id: G-0014
title: "Rework becomes a line in the project's lessons, and repeated lessons become proposed rule changes"
description: "When a task needed rework (the tester sent it back, CI failed twice, a human corrected something) the team adds one line to docs/lessons.md; the architect turns repeated lessons into proposed rule changes for the harness."
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

Agents don't remember the last session's mistakes. Without a record, the same rework
happens again in the next task and in the next project.

# Decision

- When a task needed rework (the tester sent it back, CI failed twice, or a human corrected
  something), the team adds one line to the project's `docs/lessons.md`.
- The architect turns lessons that repeat into proposed rule changes for the harness, by
  pull request.

# Rationale

One line is cheap enough to always write. Promoting only what repeats keeps the rules short,
and putting the rule in the harness fixes it for every project.

# Consequences

- `docs/lessons.md` is project content: `harness init` creates it and nothing overwrites
  it.
- A rule change that is also a global decision waits for the Engineer (G-0006).

# Guidance for agents

- Add the lesson in the same pull request as the rework: what went wrong, and what would
  have prevented it.
- Read the project's lessons before starting a task of the same kind.
- Don't turn a single lesson into a rule; wait until it repeats.
