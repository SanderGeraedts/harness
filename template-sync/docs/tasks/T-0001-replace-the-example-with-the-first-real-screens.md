---
id: T-0001
title: "Replace the example with the project's first real screens"
description: "Turn the template's list of items into the first screens this project is for, with its own data on the device and on the backend, demo data and tests."
status: Open                # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [D-0001, D-0002, D-0003, D-0004, D-0005, D-0006, D-0007, D-0008, G-0017, G-0019, G-0021]
raised_on: __DATE__
done_on: ""
result: []                  # PR URLs
---

# Goal

The project was created from the harness's template, and its app is the template's example:
a list of items with a title, a note and a status. This task replaces the example with the
first screens **__PROJECT_TITLE__** is for (D-0001):

> __PROJECT_PURPOSE__

The architect first splits this into tasks small enough for one session each, and asks the
Requester what the first screen should do.

# Done when

- The Requester has seen the first screens on a preview or a screenshot and said they are
  right.
- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e` and
  `pnpm exec harness check` pass.
- The `backend` workflow passes: the image starts on an empty database, and
  `backend/smoke-test.sh` and `pnpm run test:backend` prove the new records' rules and that
  two devices end up with the same data.
- The end-to-end tests cover the new screens offline, and check that no address holds a
  UUID.

# Notes

- Keep what the example proves: the write API and outbox (D-0002), slug addresses (D-0005),
  tokens and `/design` (D-0003), text in `src/text.ts` (D-0004), and demo data for every
  screen (G-0019).
- Rename or replace the `items` table in a new Dexie version; nothing has shipped yet, so
  the first real schema may still be version 1.
- The backend has the same example: the `items` collection, its hooks and its path in
  `backend/funnel.json`. Change them together with the table (D-0008), and keep the
  owner-only rules (D-0006) and newest-wins (D-0007) for every new collection. While no
  backend has run the first migration, it may still be rewritten; after that, only new
  migrations.

# Design

To be written by the UX designer.

# Test

Not yet tested.

# Log

One line each, newest last: `- YYYY-MM-DD <role>: <what happened>`.
