---
id: G-0006
title: "A new global decision is recorded in the project first and proposed to the harness, where it waits for the Engineer"
description: "A choice that would suit every project is recorded as a project decision so work continues, and the architect proposes it by pull request on the harness; there, a pull request that touches the global registry waits for the Engineer and every other green one merges itself."
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

Choices that belong in every project come up while working in one. Waiting for the harness
to accept them would stop the work; adding them to the harness unreviewed would change every
project at once.

# Decision

- The choice is recorded in the project's registry first, as an ordinary decision, and work
  continues on it.
- The architect also proposes it as a global decision by pull request on the harness.
- **In the harness repository, a pull request that touches `decisions/` waits for the
  Engineer**: the auto-merge workflow labels it and says so instead of merging. Every other
  green pull request that isn't a draft merges itself.
- The project decision stands whether or not the proposal is accepted.

# Rationale

The global registry is the one place where a change reaches every project, so it is the one
place a human looks at each change. Everything else in the harness is covered by its tests
(G-0015).

# Consequences

- The harness's auto-merge needs a way to hold pull requests by path; the reusable workflow
  offers it to projects as well.
- A proposal can sit until the Engineer looks; `harness waiting` shows it when an issue is
  assigned.

# Guidance for agents

- In the harness, never merge a pull request that touches `decisions/` yourself.
- Write a proposed global decision generally: no project, no person.
- Keep working from the project decision in the meantime.
