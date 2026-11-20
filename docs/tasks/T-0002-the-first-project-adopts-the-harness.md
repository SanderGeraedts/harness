---
id: T-0002
title: "The first project adopts the harness"
description: "An existing project that already works this way installs the harness at a tag, moves its process rules and process decisions to the global registry, and runs on the reusable workflows."
status: Done                # Open | Doing | Done | Dropped
depends_on: [T-0001]        # tasks that must be Done first
decisions: [G-0001, G-0002, G-0004, G-0005, G-0011, G-0025]
raised_on: 2026-11-20
done_on: "2026-11-20"
result: []                  # PR URLs
---

# Goal

Phase 2. The first project adopts the harness: an existing repository that already keeps
decisions and tasks as files switches to the installed harness, so that the harness is
proven on real work before anything is built on top of it.

The work is done in that project's repository and recorded in its own tasks. This task
tracks what the harness has to deliver for it, and any fix the switch shows to be needed.

In the project:

- `pnpm add -D github:SanderGeraedts/harness#v0.1.0`, then `pnpm exec harness init <login>`.
- Its own process decisions that a global decision now covers are set to Replaced by a
  project decision that points at the global ones; choices where it differs from a global
  decision become overrules.
- Its `AGENTS.md` and `CLAUDE.md` become the thin versions that point into `node_modules`.
- Its own task-index script, hook, deny rules and NAS tool are removed in favour of the
  harness's.
- Its CI and auto-merge workflows call the reusable ones at the tag; its backend publish
  workflow is started through `backend-workflow` and `backend-paths`.
- Its default branch is protected with `harness protect`.

# Done when

- In the project, `pnpm exec harness check` passes in CI, through the reusable CI workflow.
- A pull request there, opened as a draft and marked ready, merges itself through the
  reusable auto-merge workflow, under the ruleset.
- `pnpm exec harness overrules` there lists every place the project differs, and the
  Engineer confirms the list is right.
- Every problem the switch found in the harness is fixed here, released as a new tag, and
  the project runs on that tag.

# Notes

- The harness never names the project (AGENTS.md). Refer to it as "the first project" in
  this file, in commits and in pull requests.
- The reusable workflows have only been run from this repository so far; calling them from
  another repository is first exercised here.
- A project with a hand-maintained decision index may list records in sections; the check
  only requires that every record is linked once and nothing else is.

# Design

Nothing visible.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
- 2026-11-20 architect: Done. The first project installed v0.1.0, replaced nine process decisions by global ones, runs `harness check` in CI, and merges through the reusable CI and auto-merge workflows called across repositories (`checks / checks`, a green ready PR merged itself). Its ruleset requires the new check name; its dataset has an hourly snapshot task (G-0023). Gaps found are in T-0005.
