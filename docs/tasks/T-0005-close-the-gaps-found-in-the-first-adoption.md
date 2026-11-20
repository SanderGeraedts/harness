---
id: T-0005
title: "Close the gaps found in the first adoption"
description: "Let a project decision be replaced by a global one, let a project add to its generated registry README, give the reusable CI artifact options, and add an adopt path for repositories that already have registries."
status: Open                # Open | Doing | Done | Dropped
depends_on: [T-0002]        # tasks that must be Done first
decisions: [G-0001, G-0002, G-0004, G-0012, G-0015]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
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

Nothing visible.

# Test

# Log

