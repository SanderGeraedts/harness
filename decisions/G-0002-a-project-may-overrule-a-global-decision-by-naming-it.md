---
id: G-0002
title: "A project may overrule a global decision with its own decision that names it"
description: "A project decision with overrules: [G-NNNN] and the reason sets that global decision aside for that project; harness overrules lists every overrule and harness check verifies the ids."
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

Global decisions are defaults that suit most projects, not all of them. A project that needs
something else must be able to differ without forking the harness, and anyone reading the
project must be able to see where it differs.

# Decision

- A project overrules a global decision by recording a project decision whose front matter
  lists it: `overrules: [G-NNNN]`. Its Context says what the global decision asks and why
  that doesn't fit this project.
- While that project decision is Accepted, it wins over the global decision in that project.
- `harness overrules` lists every overrule in a project. `harness check` fails when an
  `overrules` entry names a decision that isn't in the installed global registry.
- Every global decision can be overruled this way. Whether an agent may record the overrule
  alone follows G-0009: only when it can be reversed and costs nothing.

# Rationale

Naming the overruled decision makes the difference deliberate and findable, where silently
doing something else would look like a mistake. Keeping it in the project's registry means
the harness never needs to know which projects use it.

# Consequences

- When a global decision is replaced, the projects that overruled the old one see it in the
  update's list (G-0005) and decide again.
- An overrule is a decision like any other: it is replaced, not edited.

# Guidance for agents

- Before following a global decision, check `harness overrules` for the project.
- Never work against a global decision without a recorded overrule.
- An overrule that would cost money or can't be reversed is a question for the Engineer.
