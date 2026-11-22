---
id: T-0011
title: "Make the team's pipeline faster without losing its checks"
description: "Build what G-0031 and G-0032 decide once the Engineer accepts them: task size in the template and check, agent definitions that skip the repetition, harness backend without Docker, and CI's end-to-end job split into parallel parts; released as 0.9.0."
status: Doing               # Open | Doing | Done | Dropped
size: full                  # small | full: the architect sizes it (G-0031)
depends_on: []              # tasks that must be Done first
decisions: [G-0011, G-0015, G-0031, G-0032]
raised_on: 2026-11-23
done_on: ""
result: [https://github.com/SanderGeraedts/harness/pull/22]  # PR URLs
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

Tested on 2026-11-23 at b533b30, on Windows, from `pnpm install --frozen-lockfile`.
**Verdict: sent back.** Everything the harness tests passes, but the *Done when* timing does
not: with four shards a project's end-to-end tests took 78% as long as before, not at most
half.

**Checks as run**

- `gh pr checks 22`: `checks / checks` pass (42s), `template-e2e` pass (1m43s),
  `template-backend / image` pass; `shards`, `e2e n/n` and `publish` skipping (the harness's
  own CI sets no shards). CI's log (run 45065499145): `ℹ tests 279`, `ℹ pass 279`, `ℹ fail 0`,
  `ℹ skipped 0` on Linux, including "harness backend: start, status, stop" and "fails the job
  when a test passed only on a retry"; "✓ self-test passed: 34 steps, harness 0.9.0 in a
  throwaway project"; template-e2e "✓ self-test passed: 36 steps". No retries.
- `pnpm test`: `ℹ tests 279`, `ℹ pass 278`, `ℹ fail 0`, `ℹ skipped 1` (needs jq on the
  PATH, as before).
- `pnpm run self-test`: "✓ self-test passed: 34 steps, harness 0.9.0 in a throwaway
  project", step 32 "harness backend starts a throwaway backend without Docker that the smoke
  test passes against, and stops it".
- `node bin/harness.mjs check`: "✓ tasks: 11 tasks, index in step", "✓ global decisions: 32
  records, index complete", "✓ agents: 4 definitions", "✓ skills: 1 skill".

**The real-project timing (Done when: at most half as long): not met**

In a project with a real suite (162 end-to-end tests), a throwaway draft pull request pointed
the harness dependency and the reusable workflows at b533b30, set `e2e-shards: 4` (the
default `e2e-build` was enough) and ran `harness sync`; `harness check` passed there. It was
closed and its branch deleted afterwards.

| | before (last green run of the suite now on its `main`, same tree) | with 4 shards |
| --- | --- | --- |
| end-to-end, wall clock | checks job 12m45s, its e2e step 12m10s | 9m54s from the first job's start to the last's end |
| longest job | 12m45s | e2e 4/4: 9m48s (e2e step 9m08s) |
| tests per job | 162, "162 passed (12.2m)" | 44 / 50 / 35 / 33: "44 passed (4.1m)", "50 passed (5.1m)", "35 passed (5.3m)", "33 passed (9.1m)" |

9m54s is 78% of 12m45s; half would be 6m23s. Every shard built and started its own
throwaway backend ("The throwaway backend is at http://127.0.0.1:8090" in each of the four
jobs, on its own runner), all 162 passed, and no test was flaky or retried (0 "flaky" lines,
0 "Retry #" lines in the run's log). Why it is not half:

1. **A fixed cost per shard:** each shard spent about three minutes in the project's global
   setup (building the backend's Docker image and starting it) before its first test, the
   same three minutes the single job spent (2m54s before "Running 162 tests"). Sharding
   doesn't divide it.
2. **Uneven shards:** the project runs one worker and isn't `fullyParallel`, so Playwright
   splits by file; shard 4 got 33 tests that took 9.1m, shard 1 got 44 that took 4.1m.

Back to the developer: the task's goal is the time, so either the shards must take the fixed
cost off (a backend without the per-job image build, e.g. `harness backend` or a cached
image) and balance (tests split by test, not file, or more workers), or the architect
changes the *Done when* with the Engineer. The measured numbers are above.

**What I tried to break (all as expected unless said)**

- **The size field**, through `harness tasks-index` and `--check`: `small`, `full`, empty,
  missing (counts as full), `"small"`, `small   # a comment` and a CRLF file all pass, and
  only `small` is marked "(small)"; `Small`, `medium`, `small#x` refused ("✗ T-0001-a.md:
  size "Small" isn't small/full", exit 1, no index written). `'small'` in single quotes is
  refused too; the front matter parser treats `status` the same way, so it is consistent,
  not new.
- **Dockerfile pins (`readPins`):** a plain tag, `v0.40.6`, `ARG X=0.40.6` with `${X}`,
  `ARG X="0.40.6"` with `$X`, `${X:-0.40.6}`, tag plus digest, a registry with a port,
  `--platform=` and `AS`, CRLF with a commented-out `FROM`, and a line continuation all read
  0.40.6. A digest only, `latest`, no tag, `ARG` with no default and no `FROM` are refused
  with a message that says what to pin. `ARG X='0.40.6'` (single quotes) is refused ("pins no
  PocketBase version"), not misread. Go: `golang:1.25.3-alpine` → 1.25.3,
  `ARG GO_VERSION=1.25` with `golang:${GO_VERSION}-alpine` → 1.25,
  `docker.io/library/golang:1.24.2` → 1.24.2; `golang`, `golang:alpine`, `golang:1-alpine`
  and a `main.go` without a golang image refused.
- **`harness backend` live, in a project whose path has spaces:** `stop` with nothing
  running: "No throwaway backend runs for this project.", exit 0; `status` and `smoke` with
  nothing running exit 1 with a plain message; `start` downloaded PocketBase 0.40.6 and jq
  1.8.2 into the per-user cache and started; `smoke`: "All smoke tests passed."; a second
  `start` while running stopped the first (its process gone) and started a fresh one on a new
  port; `stop` twice: stopped, then "No throwaway backend runs"; no PocketBase process left;
  `git status --porcelain --ignored` empty after start, smoke and stop.
- **A Go backend** (a minimal `main.go`, `ARG GO_VERSION=1.25`): downloaded Go 1.25.14,
  "Building backend/main.go with Go 1.25.14", started, status, stopped; the repository
  untouched.
- **A checksum mismatch** (the PocketBase zip corrupted in a download wrapper, empty cache):
  "✗ pocketbase_0.40.6_windows_amd64.zip: the checksum doesn't match (expected 33a2a1d2…,
  got 6889179c…); nothing was installed", exit 1, the cache's `tools` folder empty.
- **`ci.yml`:** parses as YAML (jobs `checks`, `shards`, `e2e`; `e2e-shards` a number,
  default 1). The shard list from `seq -s, 1 N`: 1 → `[1]` (and `shards` is skipped, the
  tests run in the checks job), 2 → `[1,2]`, 4 → `[1,2,3,4]`, 0 and -1 → the shards job is
  skipped and the tests run in the checks job; 2.5 gives `[1,2]` with `--shard=1/2.5`, which
  Playwright refuses, so it fails loudly. A string is refused by GitHub's input type. The
  flaky check reads the `github` reporter's summary, which the project's CI uses; the unit
  test covers both reporters. The required check is still only `checks / checks`, but the
  auto-merge workflow merges only a run whose conclusion is success, so a failing shard
  stops the merge.
- **The agent definitions and rules** against the Accepted global decisions: they follow
  G-0031 (sizing, no design before a small task, the review after, CI as the full run, a
  send-back re-checks what was sent back, never ready on a retry) and G-0032; nothing still
  names G-0008 as current; nothing contradicts G-0009, G-0011, G-0015, G-0019 or G-0026.
- **The record:** status Doing, `result` holds this pull request, the developer's Log line
  is there; nothing visible, so no UX review.

# Log

- 2026-11-23 architect: raised after the Engineer asked why the first project took so long;
  G-0031 (replacing G-0008) and G-0032 drafted for the Engineer; offline-first stays.
- 2026-11-23 architect: started after the Engineer merged G-0031 and G-0032 (#21); nothing visible, so no UX designer; to the developer.
- 2026-11-23 developer: built all four parts in one draft pull request (one task file and one
  README, so no conflicts between parts): `size: small | full` in the task template, refused
  by `check` and `tasks-index` when unknown, missing counts as full, the index marks
  `(small)`; the four agents and the rules per G-0031; `harness backend [start|status|smoke|stop]`
  per G-0032 (PocketBase or Go from `backend/Dockerfile`, jq 1.8.2, checksums checked, per-user
  cache, state outside the repository); `ci.yml` gains `e2e-shards` and `e2e-build`, and fails
  a run with a flaky test. Version 0.9.0. On Windows: `pnpm test` 279 tests, 278 pass, 0 fail,
  1 skipped (needs jq on the PATH, as before); `pnpm run self-test` "✓ self-test passed: 34
  steps, harness 0.9.0 in a throwaway project", step 32 starting a backend with a failing
  `docker` first on the PATH and passing "All smoke tests passed."; `node bin/harness.mjs check`
  all ✓. Also by hand on Windows: a Go backend (`FROM golang:${GO_VERSION}-alpine`, 1.25)
  downloaded Go 1.25.14, built and started. Not yet measured: the CI time with shards in a real
  project (the template's CI sets no `e2e-shards`); the tester or the Engineer needs a project
  with a real suite for the *Done when* timing.
- 2026-11-23 tester: sent back: in a project with 162 end-to-end tests, four shards took
  9m54s against 12m45s before (78%, not at most half): each shard repeats a three-minute
  backend image build, and the shards split by file are uneven (4.1m to 9.1m). Everything
  else passed: CI green with no retries, `pnpm test`, `pnpm run self-test`, `harness check`,
  and the attempts to break size, `harness backend` and `ci.yml`; see *Test*.
