---
id: G-0031
title: "The architect sizes each task, and CI is the full run that the tester doesn't repeat"
description: "Replaces G-0008: the same four roles, but the architect marks a task small or full; a small one skips the UX design before building, and for every task CI runs the whole suite once, so the developer and the tester run only what is new or affected plus their own attempts to break it."
status: Accepted            # Accepted | Replaced
date: 2026-11-23
decided_by: engineer
since: 0.9.0                # the harness version that added this record
changed: ""                 # the version in which it was replaced or redacted
replaces: [G-0008]
replaced_by: []
tags: [process]
---

# Context

G-0008 sends every task through four roles, each a fresh agent. In the first project built
from scratch with the harness, eleven features took several days of agent time. Per task:
each role re-read the rules, the decisions and earlier designs; the developer ran the whole
test suite locally, CI ran it again, and the tester ran it a third time, often repeated; and
every send-back repeated all of that. The separate roles caught real bugs (a person who
could never save, duplicate repeating to-dos, a push sender that followed redirects, double
taps that saved twice), so the roles stay. The repetition is what goes.

# Decision

- **The four roles stay** (architect, UX designer, developer, tester), and so does the gate:
  the developer builds in a draft pull request, and only the tester marks it ready.
- **The architect sizes each task** in its front matter, `size: small | full`:
  - **small:** a fix or change within existing screens and data, a text or style change,
    backend-only or tooling work, no new collection, route or outside service. The UX
    designer writes no design before building; when something visible changes, they do the
    review after. The architect's *Done when* stands in for the design.
  - **full:** everything else, as G-0008 had it: a design before building and a review
    after.
- **CI is the full run.** The developer runs locally what the change touches (typecheck,
  unit tests, the affected end-to-end files) and lets CI run everything. The tester reads
  CI's log instead of re-running the whole suite, runs the new and affected tests repeated
  to catch flakiness, and spends the rest of their time trying to break the change.
- **A send-back re-checks what was sent back,** not everything: the fix, its new test, and
  CI green with no retries.
- **Briefs are short:** a role reads the indexes and only the records and designs its task
  names, not every earlier task.

# Rationale

The value of the pipeline was in independent eyes and in the tester trying to break things,
not in running the same suite three times. CI already runs it on every push, without retries
hiding a flaky test (G-0015's lessons), so a local repeat adds time and no certainty.

# Consequences

- The task template gains `size`; `harness check` refuses a task without one.
- The agent definitions change: the architect sizes, the UX designer skips the design for a
  small task, the developer and tester run what is affected and read CI.
- A project's next `harness sync` rewrites `.claude/agents/`.

# Guidance for agents

- When in doubt, size a task **full**.
- Never mark a pull request ready on a CI run that passed only on a retry.
- The tester still writes the checks as run, with their actual output, in the task file.
