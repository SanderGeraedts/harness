---
id: T-0003
title: "Spin up a repository and app from one prompt"
description: "A command the Engineer runs that creates a new repository with the app from the default stack, the harness installed and initialised, CI and auto-merge wired, and the default branch protected."
status: Open                # Open | Doing | Done | Dropped
depends_on: [T-0002]        # tasks that must be Done first
decisions: [G-0004, G-0007, G-0016, G-0017, G-0019, G-0020, G-0021, G-0024, G-0025]
raised_on: 2026-11-20
done_on: ""
result: []                  # PR URLs
---

# Goal

Phase 3, the first half of spin-up (G-0024): the project template. From one prompt, in a
session with the Engineer, the harness creates a new project that can be worked on by the
team straight away:

- a GitHub repository;
- the app from the default stack (G-0017): React, TypeScript and Vite, TanStack Router,
  Tailwind, Vitest, Playwright, vite-plugin-pwa and Dexie, with pnpm pinned (G-0016), seeded
  demo data (G-0019) and slug addresses (G-0021);
- the harness installed at the current tag and initialised, with the Engineers listed;
- the CI and auto-merge caller workflows, pinned to the same tag;
- the default branch protected with `harness protect` once CI has run (G-0025).

Hosting and the backend are T-0004.

# Done when

- A new `harness` subcommand (or a documented prompt that drives one) creates such a project
  in a throwaway repository, and in it: `pnpm install`, the type-check, the unit tests, the
  build and `pnpm exec harness check` pass, locally and in its CI.
- A draft pull request in the new repository, marked ready, merges itself under the ruleset.
- The command refuses to run when `harness role` is not `engineer`.
- The self-test covers what can be covered without creating a real repository.

# Notes

- Decide first, as an open question for the Engineer if needed: whether the template lives
  in this repository or in a template repository of its own.
- Ask what the project is for, its look and its language (G-0020); record the answers as the
  new project's first decisions.

# Design

To be written by the UX designer for the template's first screens.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
