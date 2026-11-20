---
id: T-0003
title: "Spin up a repository and app from one prompt"
description: "A command the Engineer runs that creates a new repository with the app from the default stack, the harness installed and initialised, CI and auto-merge wired, and the default branch protected."
status: Doing               # Open | Doing | Done | Dropped
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

The template's first screens, a neutral example every project replaces: a list of items
with a title, a note and a status. Phone first, one column, at most 42rem wide.

- **Every screen:** the project's title top left with the accent bar under it, linking
  home. Under it, outside production, a quiet band: "Demo data · sync is off".
- **List (`/`):** the heading "Items" and the main button "New item". One card per item,
  newest change first: the title, a status badge (open, doing, done) and the first line of
  the note. The whole card is the link. Empty: "Nothing here yet. Add the first item."
- **Item (`/items/<slug>`):** a back link, the title as the heading with its badge, the
  note with its line breaks, then "Edit" (main button) and "Delete". Delete asks in place,
  "Delete this item?" with "Yes, delete" and "Cancel"; no pop-up. An address that leads
  nowhere shows "Not found" with a link home; an address from before a rename moves to the
  new one.
- **Form (`/items/new`, `/items/<slug>/edit`):** Title, Note (optional, four lines) and
  Status, with "Save" and "Cancel". Saving without a title says "Give the item a title."
  and stays. After saving, the item's page.
- **Look:** one accent colour, used for the heading bars, the main button, link underlines
  and the focus ring; the text on it is black or white, whichever contrasts more. Neutral
  greys for the rest, status badges in blue, amber and green. Light or dark follows the
  device; there is no switch. One font stack with no font files.
- **`/design`:** every colour token, the type sizes and each component (buttons, badges,
  card, field), in the device's colour scheme. Not in production builds.
- **Words:** all in one file, in English; another language is the new project's own task.

Review after building: checked on a phone-sized screen in light and dark. The four screens
match the above; contrast of the default accent with its text is 4.6:1.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.

- 2026-11-20 engineer: decided that the template lives in this repository, under
  `template/`, so it is versioned and tested with the harness.
- 2026-11-20 engineer: decided the command is `harness create <name>`. It asks, or takes as
  flags, what the project is for, its look (accent colour and font) and its language,
  records the answers as the project's first decisions and writes a first task list.
- 2026-11-20 engineer: decided that sync and the backend come in T-0004. This task's app is
  local-first and ready to sync (Dexie with `updatedAt`, tombstones and an outbox, one write
  API, slug addresses, seeded demo data, no backend), with a seam for T-0004: `src/sync/`
  and a config module that reads the backend address only in production builds.
- 2026-11-20 ux-designer: wrote the design of the template's first screens (above).
- 2026-11-20 developer: built `template/` and `harness create` (`lib/create.mjs`), with unit
  tests (`test/create.test.mjs`) and self-test steps: a refused create, `create --no-github`
  from the installed package, then install, type-check, unit tests, build and
  `harness check` in the created project. The template's end-to-end tests run in the
  harness's CI in their own job (`node scripts/self-test.mjs --e2e`) and in every created
  project's CI.
- 2026-11-20 developer: the rule for who may create: inside a project, the signed-in account
  must be in its `.harness/engineers`; elsewhere `--engineer` is required and must include
  the signed-in account. Outside a project this is a statement, not a lock: what really
  limits it is the account's rights on GitHub.
- 2026-11-20 developer: `create` makes the first push to the new repository's `main` without
  the project's pre-push hook: the first commit of an empty repository, before a ruleset can
  exist (G-0025). Said plainly in the pull request for the tester and the Engineer to weigh.
- 2026-11-20 developer: `--harness-ref` sets what is installed and what the workflows are
  pinned to; it defaults to the tag of the running harness. Until this is released, a
  project is created with the branch's commit as the ref.
- 2026-11-20 developer: the live run found two things, both now handled in `create`. The
  push carries workflow files, which a `gh` token without the `workflow` scope may not push:
  `create` checks this before it writes anything, and uses an empty repository of the same
  name instead of refusing it, so a stopped run can be repeated. And GitHub refuses rulesets
  on a private repository on a free plan: `create` then finishes with a `Remaining:` line
  instead of failing.
- 2026-11-20 developer: merged `main` with T-0005 (0.2.0) into the branch and set the
  version to 0.3.0, the version that will carry `create`; the tag is the tester's.
- 2026-11-20 developer: live run of `harness create` into a private throwaway repository,
  with the branch's commit as `--harness-ref`: created, pushed, first CI run green
  (`checks / checks`, with the end-to-end tests). A draft pull request with a trivial
  change stayed open while it was a draft and, marked ready, was merged by the auto-merge
  workflow after its CI run. The ruleset could not be made: GitHub refused it for a private
  repository on the account's plan (HTTP 403).
- 2026-11-20 developer: Remaining: the tester's run and the tag `v0.3.0`. For the Engineer:
  whether new repositories stay private by default now that a private one can't get a
  ruleset on a free plan; and deleting the throwaway repository, which only the Engineer
  does.
