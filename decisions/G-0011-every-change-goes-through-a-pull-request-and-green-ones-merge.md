---
id: G-0011
title: "Every change goes through a pull request; a green one that isn't a draft merges itself"
description: "A green, non-draft pull request into the default branch merges itself through the reusable auto-merge workflow, and agents may merge a green one; nobody pushes to the default branch or skips git hooks, and after a backend change the workflow starts the backend publish workflow."
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

With agents writing the code, a human review of every pull request becomes the bottleneck
and adds little that the checks and the tester (G-0008) don't. But the default branch still
has to be protected from untested changes and from tools that push directly.

# Decision

- **Every change goes through a pull request.**
- **A green pull request that isn't a draft merges itself** into the default branch, through
  the harness's reusable auto-merge workflow. Agents may also merge a green pull request.
- **Never push to the default branch, and never skip git hooks.** A pre-push hook and Claude
  Code deny rules, both written by `harness sync`, refuse it locally.
- **After merging a backend change, the auto-merge workflow starts the backend publish
  workflow,** because a merge made with `GITHUB_TOKEN` starts no push workflows.
- The merge workflow runs on `workflow_run`, so it is always the default branch's version:
  a pull request can't change how its own merge is decided.

# Rationale

The checks plus the draft gate decide; a merge that waits for a click adds delay without
adding a check. Blocking direct pushes keeps the pull request the only way in.

# Consequences

- CI must be worth trusting: a check that is missing is a change that merges unchecked.
- A project's caller workflows pass what differs: which paths are backend, and which
  workflow publishes it.
- A pull request stacked on another branch waits until its base merges.

# Guidance for agents

- Open pull requests as drafts; only the tester marks one ready.
- Never merge a red, pending or draft pull request, and never use `--no-verify`.
- Say plainly in the pull request when it changes a workflow, `.claude/` or `.githooks/`.
