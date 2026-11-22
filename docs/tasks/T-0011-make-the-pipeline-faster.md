---
id: T-0011
title: "Make the team's pipeline faster without losing its checks"
description: "Build what G-0031 and G-0032 decide once the Engineer accepts them: task size in the template and check, agent definitions that skip the repetition, harness backend without Docker, and CI's end-to-end job split into parallel parts; released as 0.9.0."
status: Doing               # Open | Doing | Done | Dropped
depends_on: []              # tasks that must be Done first
decisions: [G-0011, G-0015, G-0031, G-0032]
raised_on: 2026-11-23
done_on: ""
result: []                  # PR URLs
---

# Goal

The first project built from scratch with the harness took several days of agent time for
eleven features. The Engineer asked why, and agreed to these proposals (offline-first stays,
G-0020). This task builds them after the Engineer accepts G-0031 and G-0032:

1. **Task size (G-0031):** `size: small | full` in `templates/task.md`; `harness check` and
   `tasks-index` refuse a task without it (existing tasks without one count as full).
2. **Agent definitions (G-0031):** the architect sizes; the UX designer skips the design
   before building for a small task; the developer runs locally only what the change touches;
   the tester reads CI's log, repeats only new and affected tests, and re-checks only what it
   sent back; every role reads only the records its task names.
3. **`harness backend` (G-0032):** start and stop a throwaway backend from a pinned,
   checksummed PocketBase or Go toolchain and jq in a per-user cache, with the flags
   `throwaway.sh` uses; no Docker, no admin rights.
4. **CI speed:** the reusable `ci.yml` splits the end-to-end run into parallel shards
   (Playwright `--shard`), each with its own throwaway backend, keeping retries visible: a
   run that passed only on a retry fails the job.

# Done when

- `pnpm test` and `pnpm run self-test` pass, with unit tests and self-test steps for the
  size check, `harness backend` start/stop (on Linux in CI, and on Windows locally), and the
  sharded CI inputs.
- In a throwaway project from `harness create`, `harness backend` starts a backend that
  `backend/smoke-test.sh` passes against, with no Docker on the PATH.
- A project's CI end-to-end job takes at most half as long as before on the same suite
  (the timings before and after in *Test*).
- `node bin/harness.mjs check` passes.

# Notes

- Changes what `harness sync` writes (agent definitions, the task template): every project
  gets them on its next update. Say so in the pull request.
- Split into several pull requests if that is cleaner: size and agents; `harness backend`;
  CI shards.

# Design

Nothing visible.

# Test

Not yet tested.

# Log

- 2026-11-23 architect: raised after the Engineer asked why the first project took so long;
  G-0031 (replacing G-0008) and G-0032 drafted for the Engineer; offline-first stays.
- 2026-11-23 architect: started after the Engineer merged G-0031 and G-0032 (#21); nothing visible, so no UX designer; to the developer.
