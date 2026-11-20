---
id: G-0001
title: "Decisions live as files in two registries: a global one in the harness and one in each project"
description: "Every lasting choice is a file: G-NNNN in the harness for what holds in every project, D-NNNN and Q-NNN in a project for what is specific to it; decisions are replaced, never edited."
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

Agents start every session without memory of the last one. What was chosen, and why, has
to be somewhere they read before they change anything, and chat history is not that place.
Several projects work the same way, so most choices about how to work are the same in each
of them; copying those into every project lets them drift apart.

# Decision

- **The global registry** is the `decisions/` folder of the harness. Its records are
  `G-NNNN-<slug>.md` and hold in every project that installs the harness.
- **Each project has its own registry** in `docs/decisions/`: `D-NNNN` decisions and
  `Q-NNN` open questions, for choices specific to that project.
- Each registry has an `index.md` that lists every record with one sentence. Agents read
  the global index, then the project's, then only the records their work touches.
- **Decisions are replaced, never edited** once Accepted (the one exception is G-0003). To
  change one, a new record stands alone, lists the old one in `replaces`, and the old one
  becomes `Replaced` with `replaced_by`.
- Every decision ends with *Guidance for agents*. Ids are never reused.

# Rationale

Files in the repository are versioned with the code they explain, readable by any agent, and
reviewable in a pull request. Two registries keep what is shared in one place and leave each
project free to record what is its own. Replacing instead of editing keeps the history of
why something changed.

# Consequences

- A project reads two indexes. `harness check` verifies both the project's index and
  its records' front matter.
- A global decision changes for every project at once, on their next harness update
  (G-0005).

# Guidance for agents

- Read both indexes before changing anything, and the records your change touches.
- Record a choice when reversing it would need a discussion; put it in the project unless
  it is being accepted into the harness (G-0006).
- Never edit an Accepted decision; replace it.
