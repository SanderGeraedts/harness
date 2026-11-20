---
id: G-0005
title: "A harness update lists every new or changed global decision, and the architect conforms or overrules"
description: "The pull request that bumps the harness in a project carries the output of harness changes <from> <to>; per decision the project's architect opens a task to conform or records an overruling decision."
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

A new harness version can bring global decisions the project does not yet follow. A version
bump that only changes a lockfile line would bring them in unseen.

# Decision

- The pull request that bumps the harness lists every global decision added, changed or
  replaced between the two versions: the output of `harness changes <from> <to>`.
- Every global record carries `since` (the version that added it) and, when its status
  changed or it was redacted, `changed` (the version that did so). `harness changes` reads
  those from the installed copy, so it runs after the new version is installed.
- Per listed decision, the project's architect either opens a task to make the project
  conform, or records a project decision that overrules it (G-0002).
- The same pull request runs `harness sync` and bumps the workflows' tag.

# Rationale

The list turns an invisible change into explicit work or an explicit difference. Reading
versions from the records works from an installed package, with no git history needed.

# Consequences

- Whoever adds or replaces a global decision must set `since` or `changed` to the version
  that will carry it; `harness check` verifies the fields in the harness.
- A project may stay on an old version; nothing forces the update.

# Guidance for agents

- Never merge a harness bump without the list and a task or overrule per decision.
- Don't conform silently inside the bump; conforming is its own task.
