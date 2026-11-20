---
id: T-0005
title: "Close the gaps found in the first adoption"
description: "Let a project decision be replaced by a global one, let a project add to its generated registry README, give the reusable CI artifact options, and add an adopt path for repositories that already have registries."
status: Doing               # Open | Doing | Done | Dropped
depends_on: [T-0002]        # tasks that must be Done first
decisions: [G-0001, G-0002, G-0004, G-0012, G-0015]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/harness/pull/4"]                  # PR URLs
---

# Goal

The first project to adopt the harness (T-0002) had to work around four things:

1. **No cross-registry `replaced_by`.** A project decision can't name the `G-NNNN` that
   replaces it; `harness check` only accepts ids from the project's registry. The project
   pointed every replaced decision at one new project decision that maps them. Let
   `replaced_by` name a global decision that exists in the installed harness.
2. **The generated `docs/decisions/README.md` can't be added to.** `check` fails when it
   differs from the template. Give it a marked project section that `sync` keeps.
3. **The reusable CI uploads one fixed artifact** on every run. Add inputs for the artifact's
   name and for uploading only on failure.
4. **No adopt path.** `init` skips existing files silently. Add `harness adopt`: it reports
   what exists, what it would add, and lists the project decisions whose titles match a
   global one, as candidates to replace.

Also from T-0001's open points: run CI on the default branch after a bot merge (a merge made
with `GITHUB_TOKEN` starts no push workflow), and prove the hold path (a pull request that
touches `decisions/` is labelled and waits for the Engineer) on a real pull request.

# Done when

- Tests for each of the four, and the self-test adopts a throwaway project that already has a
  registry with a decision matching a global one.
- `pnpm test`, `pnpm run check` and `pnpm run self-test` pass; a new tag is released.

# Notes

Changing `check`'s rules is a harness change, not a global decision: it doesn't wait for the
Engineer unless it touches `decisions/`.

# Design

Nothing visible: the changes are command output, generated files and workflow inputs.

# Test

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
- 2026-11-20 developer: built the five parts as 0.2.0, in a draft pull request. (1) `check`
  accepts a `replaced_by` that names a global decision of the installed harness, and fails
  on one that isn't there. (2) The generated registry README ends with a project section
  between two marker lines that `sync` keeps and `check` ignores. (3) The reusable CI has
  the inputs `artifact-name` (default `ci-artifacts`) and `artifacts-only-on-failure`
  (default `false`). (4) `harness adopt` reports what is there, what it would add, which
  generated files differ and which project decisions look like a global one;
  `adopt --write` adds what is missing and overwrites nothing. (5) The reusable auto-merge
  starts the CI workflow named by `ci-workflow` (default `ci.yml`) on the default branch
  after a merge; the harness's own CI has `workflow_dispatch:` and its auto-merge
  `actions: write`.
- 2026-11-20 developer: `pnpm test` passes (81 tests, 20 suites), `pnpm run check` passes
  (5 tasks, 25 global records, 4 agent definitions) and `pnpm run self-test` passes in 16
  steps; step 16 adopts a second throwaway project that already has a registry with a
  decision matching G-0016. `decisions/` is untouched, so the pull request doesn't wait for
  the Engineer. `sync` now writes a different registry README and decision template in
  every project, on its next update.
- 2026-11-20 developer: Remaining: the tester's run and the release tag `v0.2.0`; the
  hold-path proof on a real pull request that touches `decisions/`; and a look at the first
  merge after this one, which is the first that can start CI on `main` by itself (the
  auto-merge workflow runs from `main`, so this pull request's own merge still uses the
  0.1.0 workflow and starts no CI there).
