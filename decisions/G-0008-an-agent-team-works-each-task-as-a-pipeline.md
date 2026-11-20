---
id: G-0008
title: "A team of four agents works each task as a pipeline: architect, UX designer, developer, tester"
description: "Each task passes from the architect to the UX designer (for anything visible), the developer and the tester; each writes its result in the task file, the developer builds in a draft pull request, and only the tester marks it ready, so nothing merges untested."
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

One agent that plans, builds and checks its own work tends to pass its own work. Pull
requests merge themselves when green (G-0011), so something other than a human review has
to stand between a change and the default branch.

# Decision

Each task goes through the roles in order, and each role writes its result in the task file.

- **Architect:** turns a request into a task with a check, names the decisions it follows,
  records new decisions, raises questions.
- **UX designer:** for anything a user sees, the design before it is built and a review
  after.
- **Developer:** builds it in a **draft** pull request.
- **Tester:** runs the task's check independently, tries to break it, writes the result in
  the task file, and only then marks the pull request ready. Auto-merge skips drafts, so
  nothing merges untested.

The roles are Claude Code subagents, defined in the harness and written into a project's
`.claude/agents/` by `harness sync`.

**Accepted risk:** four agents per task cost more tokens than one.

# Rationale

Separate roles with separate instructions catch what a single pass misses, and the draft
state gives the tester a real gate that the merge workflow already respects. The task file
as the hand-over point means every role's result is on record.

# Consequences

- Small tasks still pass through every role that applies; the UX designer is skipped only
  when nothing visible changes.
- The task template has a place for each role's result.

# Guidance for agents

- Do your own role's work and hand over; don't do the next role's.
- The developer never marks a pull request ready; the tester never fixes the code.
- Write your result in the task file before handing over.
