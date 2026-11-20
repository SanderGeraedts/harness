---
id: G-0010
title: "The Engineer is reached through an open question in the registry and a GitHub issue assigned to them"
description: "When a choice needs the Engineer, the architect records an open question in the project's registry and opens a GitHub issue assigned to the Engineer; the Requester hears in plain words that this part waits, all other work continues, and the answer becomes the decision record."
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

The Engineer is usually not in the session when a question for them comes up; often a
Requester is. The question must not be lost, must not block everything else, and must not be
put to the Requester instead.

# Decision

- The architect records an open question (`Q-NNN`) in the project's registry, with the
  options and a recommendation, and opens a GitHub issue assigned to the Engineer that links
  to it.
- The Requester hears in plain words that this part waits, and why.
- All work that doesn't depend on the answer continues.
- The Engineer's answer becomes a decision record that resolves the question; the issue is
  closed with a link to it.

# Rationale

The question in the registry keeps the reasoning with the other decisions; the assigned
issue is what actually notifies the Engineer and shows up across projects.

# Consequences

- Sessions need `gh` to open the issue; without it the question is still recorded and the
  issue is opened by the next session that can.
- `harness waiting` lists both (G-0013).

# Guidance for agents

- Don't answer a question meant for the Engineer, and don't ask the Requester to.
- Always give options and a recommendation; a bare question costs the Engineer a round trip.
- Keep working on everything the question doesn't block.
